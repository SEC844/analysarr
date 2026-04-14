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


def _match_torrent_to_files(torrent: QbitTorrent, file_paths: set[str]) -> bool:
    """Vérifie si un torrent correspond à un des fichiers trouvés par path overlap."""
    content = (torrent.content_path or torrent.save_path or "").rstrip("/")
    if not content:
        return False
    save = torrent.save_path.rstrip("/")
    for fpath in file_paths:
        if fpath.startswith(content) or content == fpath:
            return True
        if save and fpath.startswith(save + "/"):
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

    # 5. Drapeaux et classification
    is_seeding      = len(matched_qbit) > 0
    is_hardlinked   = len(torrent_hardlinks) > 0
    is_cross_seeded = len(crossseed_files) > 0
    is_duplicate    = len(torrent_same_size) > 0 and not is_hardlinked

    if not is_seeding:
        status = SeedStatus.NOT_SEEDING
    elif is_hardlinked and is_cross_seeded:
        status = SeedStatus.SEED_OK
    elif is_hardlinked:
        status = SeedStatus.SEED_NO_CS
    elif is_duplicate:
        status = SeedStatus.SEED_DUPLICATE
    else:
        status = SeedStatus.SEED_NOT_HARDLINK

    return {
        "seed_status": status,
        "torrents_files": torrent_hardlinks + torrent_same_size,
        "crossseed_files": crossseed_files,
        "matched_torrents": matched_qbit,
        "is_hardlinked": is_hardlinked,
        "is_cross_seeded": is_cross_seeded,
        "is_duplicate": is_duplicate,
    }
