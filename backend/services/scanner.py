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
"""
from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
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


def _torrent_is_hardlinked(torrent: QbitTorrent, hardlink_paths: set[str]) -> bool:
    """
    Retourne True si le contenu du torrent contient au moins un hardlink
    du fichier de référence.

    Ex: content_path = /data/torrents/complete/Avatar.2160p.mkv
        hardlink_paths = {/data/torrents/complete/Avatar.2160p.mkv, /data/cross-seed/...}
        → True (le fichier de référence SE TROUVE dans ce torrent)
    """
    if not hardlink_paths:
        return False
    content = (torrent.content_path or "").rstrip("/")
    if not content:
        return False
    for hpath in hardlink_paths:
        if hpath == content or hpath.startswith(content + "/"):
            return True
    return False


def _match_torrent_to_files(torrent: QbitTorrent, file_paths: set[str]) -> bool:
    """
    Vérifie si un torrent correspond à un des fichiers trouvés par path overlap.

    Règle principale : content_path est utilisé seulement s'il est PLUS SPÉCIFIQUE
    que save_path (sinon content_path == save_path = répertoire générique → faux positifs).

    Fallback nom : si content_path == save_path, on compare le nom du torrent avec
    le premier segment du chemin relatif à save_path (ex: /data/complete/<NOM>/…).
    """
    if not file_paths:
        return False

    content = (torrent.content_path or "").rstrip("/")
    save    = (torrent.save_path    or "").rstrip("/")

    # content_path est utile seulement s'il est plus long/spécifique que save_path
    use_content = bool(content and content != save and len(content) > len(save))

    for fpath in file_paths:
        # ── Priorité 1 : correspondance exacte ou préfixe du content_path ──
        if use_content:
            if fpath == content or fpath.startswith(content + "/"):
                return True

        # ── Priorité 2 : fallback par nom de torrent ─────────────────────────
        # Compare le nom du torrent avec le premier répertoire/fichier
        # dans le save_path (ex : /data/complete/Avatar.2009.BluRay/…  → "Avatar 2009 BluRay")
        if save and fpath.startswith(save + "/"):
            rel = fpath[len(save):].lstrip("/")
            first_seg = rel.split("/")[0] if rel else ""
            if not first_seg:
                continue
            # Retire l'extension pour les torrents single-file
            first_seg_base = os.path.splitext(first_seg)[0]
            norm_seg  = first_seg_base.replace(".", " ").replace("_", " ").lower().strip()
            norm_name = torrent.name.replace(".", " ").replace("_", " ").lower().strip()
            if not norm_name or not norm_seg:
                continue
            # Correspondance exacte ou l'un est sous-chaîne significative de l'autre
            if norm_name == norm_seg:
                return True
            if len(norm_name) > 10 and norm_seg.startswith(norm_name[:10]):
                return True
            if len(norm_seg) > 10 and norm_name.startswith(norm_seg[:10]):
                return True

    return False


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

    1. Lookup inode  dans torrent_index  → hardlinks
    2. Lookup taille dans torrent_index  → doublons (inode différent)
    3. Lookup inode  dans crossseed_index → cross-seeds
    4. Match aux torrents qBit actifs par path overlap
    5. Classification
    """
    empty = {
        "seed_status": SeedStatus.NOT_SEEDING,
        "torrents_files": [], "crossseed_files": [],
        "matched_torrents": [],
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

    # 3. Cross-seeds (même inode dans /crossseed)
    crossseed_files: list[FileMetadata] = crossseed_index.by_inode.get(media_file.inode, [])

    # 4. Association aux torrents qBit actifs
    all_paths: set[str] = {
        f.path for f in torrent_hardlinks + torrent_same_size + crossseed_files
    }
    matched_qbit: list[QbitTorrent] = [
        t for t in qbit_torrents
        if t.state in QBIT_SEEDING_STATES and _match_torrent_to_files(t, all_paths)
    ]

    # Séparer les torrents :
    #   matched_hl  = torrents dont le contenu EST le fichier de référence (hardlinked)
    #   matched_dup = torrents associés par nom/chemin mais avec un FICHIER DIFFÉRENT
    #                 (autre qualité, autre encode — même film, copie physique distincte)
    hardlink_paths = {f.path for f in torrent_hardlinks + crossseed_files}
    matched_hl:  list[QbitTorrent] = [t for t in matched_qbit if _torrent_is_hardlinked(t, hardlink_paths)]
    matched_dup: list[QbitTorrent] = [t for t in matched_qbit if not _torrent_is_hardlinked(t, hardlink_paths)]

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
