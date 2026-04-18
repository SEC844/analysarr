"""
Scanner — CŒUR de l'application.

Toute la logique de classification inode/hardlink/duplicate est ici.
Aucun subprocess, aucun hash MD5/SHA — uniquement os.stat() pour les inodes.

Optimisation performance :
  Au lieu de scanner le répertoire /torrents pour CHAQUE média (O(n×m)),
  on scanne UNE SEULE FOIS pour construire deux index :
    - inode_index[inode] → liste de FileMetadata
    - size_index[size]   → liste de FileMetadata
  Puis pour chaque média on fait des lookups O(1).

Association torrent ↔ média :
  On n'utilise PAS de comparaison par nom/chemin approximative. On détermine
  qu'un torrent qBit est lié à un média quand un fichier de ce torrent (donc
  situé sous son content_path ou save_path) a un inode qui correspond à celui
  du fichier de référence. Un torrent avec un fichier de même taille mais
  d'inode différent est classé comme doublon.
"""
from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import Optional

from ..models.schemas import FileMetadata, SeedStatus, QbitTorrent

logger = logging.getLogger(__name__)

QBIT_SEEDING_STATES: frozenset[str] = frozenset([
    "seeding", "stalledUP", "forcedUP", "queuedUP", "uploading", "checkingUP",
])

MAX_SCAN_DEPTH = 5  # niveaux de profondeur max lors des scans récursifs


# ── Index pré-construit ───────────────────────────────────────────────────────

@dataclass
class TorrentIndex:
    """Index en mémoire construit en scannant un répertoire une seule fois."""
    by_inode: dict[int, list[FileMetadata]] = field(default_factory=dict)
    by_size:  dict[int, list[FileMetadata]] = field(default_factory=dict)

    @classmethod
    def empty(cls) -> "TorrentIndex":
        return cls()


def build_index(directory: str) -> TorrentIndex:
    """
    Scanne `directory` récursivement UNE SEULE FOIS et construit deux index.
    Complexité : O(m) où m = nombre de fichiers dans le répertoire.
    """
    idx = TorrentIndex()

    if not directory or not os.path.isdir(directory):
        return idx

    base_depth = directory.rstrip(os.sep).count(os.sep)

    for root, dirs, files in os.walk(directory):
        depth = root.count(os.sep) - base_depth
        if depth >= MAX_SCAN_DEPTH:
            dirs.clear()
            continue
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                st = os.stat(fpath)
                fm = FileMetadata(
                    path=fpath,
                    size=st.st_size,
                    inode=st.st_ino,
                    nlink=st.st_nlink,
                    exists=True,
                )
                idx.by_inode.setdefault(st.st_ino, []).append(fm)
                idx.by_size.setdefault(st.st_size, []).append(fm)
            except OSError:
                continue

    logger.debug("Index '%s' : %d inodes, %d tailles", directory, len(idx.by_inode), len(idx.by_size))
    return idx


# ── Helpers filesystem ───────────────────────────────────────────────────────

def get_file_metadata(path: str) -> FileMetadata:
    """Récupère les métadonnées filesystem d'un fichier via os.stat()."""
    try:
        stat = os.stat(path)
        return FileMetadata(
            path=path,
            size=stat.st_size,
            inode=stat.st_ino,
            nlink=stat.st_nlink,
            exists=True,
        )
    except (FileNotFoundError, PermissionError, OSError):
        return FileMetadata(path=path, exists=False)


# ── Association torrent ↔ fichiers (PAR INODE, pas par nom) ──────────────────

def _find_torrent_files_by_inode(
    torrent: QbitTorrent,
    target_inode: int,
    torrent_index: TorrentIndex,
) -> list[FileMetadata]:
    """
    Retrouve les fichiers d'un torrent qui partagent l'inode cible.

    Stratégie :
      - Récupérer la liste des fichiers de l'index ayant cet inode (O(1))
      - Ne garder que ceux situés sous le content_path du torrent

    On utilise content_path comme frontière car c'est la valeur précise donnée
    par qBittorrent (chemin exact du fichier pour un torrent single-file, chemin
    du dossier racine pour un multi-file). save_path n'est PAS utilisé comme
    frontière : il est partagé entre tous les torrents du même dossier de
    téléchargement et causerait des faux positifs (un autre torrent dans le
    même save_path serait considéré comme possédant l'inode de la référence).

    La comparaison sémantique "est-ce un hardlink" reste 100% basée sur l'inode —
    le chemin sert uniquement à décider quel torrent possède le fichier.
    """
    if target_inode <= 0:
        return []

    candidates = torrent_index.by_inode.get(target_inode, [])
    if not candidates:
        return []

    content = (torrent.content_path or "").rstrip("/")
    if not content:
        # Fallback extrême : pas de content_path (torrent en cours de download,
        # ou données incohérentes). On utilise save_path mais c'est best-effort.
        save = (torrent.save_path or "").rstrip("/")
        if not save:
            return []
        return [
            fm for fm in candidates
            if fm.path == save or fm.path.startswith(save + "/")
        ]

    return [
        fm for fm in candidates
        if fm.path == content or fm.path.startswith(content + "/")
    ]


def _torrent_owns_inode(
    torrent: QbitTorrent,
    target_inode: int,
    torrent_index: TorrentIndex,
) -> bool:
    """True si le torrent possède au moins un fichier avec cet inode."""
    return bool(_find_torrent_files_by_inode(torrent, target_inode, torrent_index))


# ── Classification principale (O(1) grâce aux index) ─────────────────────────

def classify_media_file(
    media_file: FileMetadata,
    torrent_index: TorrentIndex,
    crossseed_index: TorrentIndex,
    qbit_torrents: list[QbitTorrent],
) -> dict:
    """
    Classifie un fichier média selon les 5 états SeedStatus.

    Utilise les index pré-construits (O(1) par média au lieu de O(m)).

    1. Lookup inode  dans torrent_index  → hardlinks (même fichier physique)
    2. Lookup taille dans torrent_index  → doublons (même taille, inode différent)
    3. Lookup inode  dans crossseed_index → cross-seeds
    4. Pour chaque torrent qBit actif : déterminer via l'inode s'il est
       hardlinké au fichier de référence ou s'il s'agit d'un doublon.
    5. Classification en 5 états.
    """
    empty = {
        "seed_status": SeedStatus.NOT_SEEDING,
        "torrents_files": [], "duplicate_files": [], "crossseed_files": [],
        "matched_torrents": [], "duplicate_torrents": [],
        "is_hardlinked": False, "is_cross_seeded": False, "is_duplicate": False,
    }

    if not media_file.exists or not media_file.inode:
        return empty

    # 1. Hardlinks (même inode → même fichier physique)
    torrent_hardlinks: list[FileMetadata] = torrent_index.by_inode.get(media_file.inode, [])

    # 2. Doublons (même taille, inode DIFFÉRENT → copie distincte)
    torrent_same_size: list[FileMetadata] = [
        f for f in torrent_index.by_size.get(media_file.size, [])
        if f.inode != media_file.inode
    ]
    # Ensemble des inodes "doublons" (même taille, inode ≠ media_file)
    dup_inodes: set[int] = {f.inode for f in torrent_same_size if f.inode > 0}

    # 3. Cross-seeds (même inode dans /crossseed)
    crossseed_files: list[FileMetadata] = crossseed_index.by_inode.get(media_file.inode, [])

    # 4. Classification des torrents qBit actifs (UNIQUEMENT via l'inode)
    matched_hl:  list[QbitTorrent] = []
    matched_dup: list[QbitTorrent] = []

    for t in qbit_torrents:
        if t.state not in QBIT_SEEDING_STATES:
            continue

        # 4a. Ce torrent possède-t-il le fichier de référence (même inode) ?
        if _torrent_owns_inode(t, media_file.inode, torrent_index):
            matched_hl.append(t)
            continue

        # 4b. Sinon, possède-t-il un doublon (même taille, inode différent) ?
        owns_dup = False
        if dup_inodes:
            for dup_inode in dup_inodes:
                if _torrent_owns_inode(t, dup_inode, torrent_index):
                    owns_dup = True
                    break
        if owns_dup:
            matched_dup.append(t)

    # 5. Drapeaux et classification
    #
    # Règles hardlink :
    #   - Un fichier est hardlinké si son inode se trouve dans /torrents OU dans /crossseed
    #   - On est "en seed" si qBit a un torrent hardlinké actif OU si crossseed a le fichier
    #   - is_duplicate (flag) = copies physiques identiques (même taille, inode différent)
    #                         OU versions alternatives du même film (duplicate_torrents non vides)
    is_cross_seeded = len(crossseed_files) > 0
    is_hardlinked   = len(torrent_hardlinks) > 0 or is_cross_seeded      # même inode = hardlink
    is_seeding      = len(matched_hl) > 0 or is_cross_seeded             # reference file seedée
    is_duplicate    = (len(torrent_same_size) > 0 and not is_hardlinked) or len(matched_dup) > 0

    if not is_seeding:
        status = SeedStatus.NOT_SEEDING
    elif is_hardlinked and is_cross_seeded:
        status = SeedStatus.SEED_OK
    elif is_hardlinked:
        status = SeedStatus.SEED_NO_CS
    elif len(torrent_same_size) > 0 and not is_hardlinked:
        status = SeedStatus.SEED_DUPLICATE
    else:
        status = SeedStatus.SEED_NOT_HARDLINK

    return {
        "seed_status":        status,
        "torrents_files":     torrent_hardlinks,   # hardlinks (inode identique)
        "duplicate_files":    torrent_same_size,   # copies physiques (même taille, inode différent)
        "crossseed_files":    crossseed_files,
        "matched_torrents":   matched_hl,          # torrents dont le contenu est hardlinké
        "duplicate_torrents": matched_dup,         # même film, fichier différent (autre qualité)
        "is_hardlinked":      is_hardlinked,
        "is_cross_seeded":    is_cross_seeded,
        "is_duplicate":       is_duplicate,
    }
