"""
Scanner — CŒUR de l'application.

Toute la logique de classification inode/hardlink/duplicate est ici.
Aucun subprocess, aucun hash MD5/SHA — uniquement os.stat() pour les inodes.
"""
from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from ..models.schemas import (
    FileMetadata, SeedStatus, QbitTorrent, MediaItem,
    MediaSource, MediaType,
)

logger = logging.getLogger(__name__)

QBIT_SEEDING_STATES: frozenset[str] = frozenset([
    "seeding", "stalledUP", "forcedUP", "queuedUP", "uploading", "checkingUP",
])

MAX_SCAN_DEPTH = 5  # niveaux de profondeur max lors des scans récursifs


# ── Helpers filesystem ────────────────────────────────────────────────────────

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


def scan_directory_for_inode(directory: str, target_inode: int) -> list[FileMetadata]:
    """
    Cherche tous les fichiers partageant un inode donné dans un répertoire (récursif).
    Limité à MAX_SCAN_DEPTH niveaux.
    """
    if not target_inode or not os.path.isdir(directory):
        return []

    results: list[FileMetadata] = []
    base_depth = directory.rstrip(os.sep).count(os.sep)

    for root, dirs, files in os.scandir_walk(directory):
        depth = root.count(os.sep) - base_depth
        if depth >= MAX_SCAN_DEPTH:
            dirs.clear()
            continue
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                stat = os.stat(fpath)
                if stat.st_ino == target_inode:
                    results.append(FileMetadata(
                        path=fpath,
                        size=stat.st_size,
                        inode=stat.st_ino,
                        nlink=stat.st_nlink,
                        exists=True,
                    ))
            except (PermissionError, FileNotFoundError, OSError):
                continue

    return results


def scan_directory_for_size(
    directory: str,
    target_size: int,
    exclude_inode: int = 0,
    tolerance_bytes: int = 0,
) -> list[FileMetadata]:
    """
    Cherche tous les fichiers de taille identique (tolérance 0 par défaut).
    Exclut les fichiers partageant l'inode de référence (ce sont des hardlinks, pas des doublons).
    """
    if target_size <= 0 or not os.path.isdir(directory):
        return []

    results: list[FileMetadata] = []
    base_depth = directory.rstrip(os.sep).count(os.sep)

    for root, dirs, files in os.walk(directory):
        depth = root.count(os.sep) - base_depth
        if depth >= MAX_SCAN_DEPTH:
            dirs.clear()
            continue
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                stat = os.stat(fpath)
                if exclude_inode and stat.st_ino == exclude_inode:
                    continue  # même inode = hardlink, pas un doublon
                if abs(stat.st_size - target_size) <= tolerance_bytes:
                    results.append(FileMetadata(
                        path=fpath,
                        size=stat.st_size,
                        inode=stat.st_ino,
                        nlink=stat.st_nlink,
                        exists=True,
                    ))
            except (PermissionError, FileNotFoundError, OSError):
                continue

    return results


def _match_torrent_to_files(
    torrent: QbitTorrent,
    file_paths: set[str],
) -> bool:
    """
    Vérifie si un torrent correspond à un des fichiers trouvés.
    Le content_path du torrent doit être un préfixe d'un fichier
    ou un fichier doit être dans le save_path du torrent.
    """
    content = (torrent.content_path or torrent.save_path or "").rstrip("/")
    if not content:
        return False

    for fpath in file_paths:
        # Le fichier est dans le torrent
        if fpath.startswith(content):
            return True
        # Le torrent est le fichier exact
        if content == fpath:
            return True
        # Le fichier est dans le répertoire save_path
        save = torrent.save_path.rstrip("/")
        if save and fpath.startswith(save + "/"):
            return True

    return False


# ── Classification principale ─────────────────────────────────────────────────

def classify_media_file(
    media_file: FileMetadata,
    torrents_dir: str,
    crossseed_dir: Optional[str],
    qbit_torrents: list[QbitTorrent],
) -> dict:
    """
    Classification d'un fichier média selon les 5 états SeedStatus.

    Algorithme :
    1. Scan /torrents par inode → hardlinks (même fichier physique)
    2. Scan /torrents par taille exacte → doublons potentiels (fichier différent, même taille)
    3. Scan /crossseed par inode → cross-seeds confirmés
    4. Associer aux torrents qBit actifs par path overlap
    5. Classifier selon la combinaison des résultats

    Returns dict avec seed_status, torrents_files, crossseed_files,
    matched_torrents, is_hardlinked, is_cross_seeded, is_duplicate.
    """
    empty_result = {
        "seed_status": SeedStatus.NOT_SEEDING,
        "torrents_files": [],
        "crossseed_files": [],
        "matched_torrents": [],
        "is_hardlinked": False,
        "is_cross_seeded": False,
        "is_duplicate": False,
    }

    if not media_file.exists or not media_file.inode:
        return empty_result

    # 1. Hardlinks dans /torrents (même inode = même fichier physique = hardlink confirmé)
    torrent_hardlinks = scan_directory_for_inode(torrents_dir, media_file.inode)

    # 2. Doublons dans /torrents (même taille, inode DIFFÉRENT = copie physique distincte)
    torrent_same_size = scan_directory_for_size(
        torrents_dir,
        media_file.size,
        exclude_inode=media_file.inode,
        tolerance_bytes=0,  # 0% tolérance — correspondance exacte obligatoire
    )

    # 3. Cross-seeds (même inode dans /crossseed = hardlink cross-seed)
    crossseed_files: list[FileMetadata] = []
    if crossseed_dir and os.path.isdir(crossseed_dir):
        crossseed_files = scan_directory_for_inode(crossseed_dir, media_file.inode)

    # 4. Association aux torrents qBit
    all_found_paths: set[str] = {
        f.path for f in torrent_hardlinks + torrent_same_size + crossseed_files
    }

    matched_qbit: list[QbitTorrent] = []
    for torrent in qbit_torrents:
        if torrent.state not in QBIT_SEEDING_STATES:
            continue
        if _match_torrent_to_files(torrent, all_found_paths):
            matched_qbit.append(torrent)

    # 5. Drapeaux dérivés
    is_seeding     = len(matched_qbit) > 0
    is_hardlinked  = len(torrent_hardlinks) > 0
    is_cross_seeded = len(crossseed_files) > 0
    is_duplicate   = len(torrent_same_size) > 0 and not is_hardlinked

    # 6. Classification (priorité dans l'ordre)
    if not is_seeding:
        status = SeedStatus.NOT_SEEDING
    elif is_hardlinked and is_cross_seeded:
        status = SeedStatus.SEED_OK
    elif is_hardlinked and not is_cross_seeded:
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


# ── os.scandir_walk — wrapper performant ──────────────────────────────────────
# os.walk utilise os.scandir en interne depuis Python 3.5.
# On expose un alias propre pour les tests.
os.scandir_walk = os.walk  # type: ignore[attr-defined]
