import os
import zipfile
import urllib.request
import logging
from pathlib import Path

logger = logging.getLogger("legacymind.repo_fetcher")

class RepoFetcher:
    """Fetches real open-source ABAP code from GitHub."""

    # Using the famous open-source abap2xlsx repository as our dataset
    REPO_URL = "https://github.com/abap2xlsx/abap2xlsx/archive/refs/heads/main.zip"
    TARGET_DIR = Path(__file__).parent.parent / "abap_codebase"

    @classmethod
    def fetch_codebase(cls) -> bool:
        """Download and extract the ABAP repository if it doesn't exist.
        Returns True if newly fetched, False if already cached.
        """
        if cls.TARGET_DIR.exists() and len(list(cls.TARGET_DIR.glob("**/*.abap"))) > 0:
            logger.info("Real ABAP codebase already cached.")
            return False

        logger.info("Downloading real open-source ABAP repository (abap2xlsx)...")
        cls.TARGET_DIR.mkdir(parents=True, exist_ok=True)
        
        zip_path = cls.TARGET_DIR / "repo.zip"
        try:
            # Download the zip file
            urllib.request.urlretrieve(cls.REPO_URL, zip_path)
            logger.info("Download complete. Extracting files...")
            
            # Extract the zip file
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(cls.TARGET_DIR)
                
            # Clean up the zip file
            zip_path.unlink()
            
            abap_count = len(list(cls.TARGET_DIR.glob("**/*.abap")))
            logger.info(f"Successfully extracted {abap_count} real ABAP files.")
            return True
            
        except Exception as e:
            logger.error(f"Failed to fetch ABAP repository: {e}")
            raise
