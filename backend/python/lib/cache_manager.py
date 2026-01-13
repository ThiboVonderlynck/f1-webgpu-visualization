"""
Cache Manager for FastF1
Handles cache health checks and automatic cleanup of corrupted cache files.
"""
import os
import subprocess
import sys
import time

# Cache configuration
CACHE_DIR = '.fastf1-cache'
CACHE_FILE = 'fastf1_http_cache.sqlite'
MAX_IMPORT_TIME = 5.0  # seconds - anything longer suggests corruption


def get_cache_path():
    """Get the absolute path to the cache directory"""
    # Navigate up from lib/ to project root
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    return os.path.join(project_root, CACHE_DIR)


def get_cache_file_path():
    """Get the absolute path to the SQLite cache file"""
    return os.path.join(get_cache_path(), CACHE_FILE)


def clear_cache():
    """Remove the FastF1 SQLite cache file"""
    cache_file = get_cache_file_path()
    if os.path.exists(cache_file):
        try:
            os.remove(cache_file)
            print(f"   ✓ Removed {CACHE_FILE}")
            return True
        except Exception as e:
            print(f"   ✗ Failed to remove cache: {e}")
            return False
    return True


def test_import_speed():
    """
    Test how long it takes to import fastf1 in a subprocess.
    Returns the import time in seconds, or -1 if the test failed.
    """
    test_script = '''
import time
start = time.time()
import fastf1
print(f"{time.time() - start:.2f}")
'''
    try:
        result = subprocess.run(
            [sys.executable, '-c', test_script],
            capture_output=True,
            text=True,
            timeout=60,  # 1 minute max
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        if result.returncode == 0:
            return float(result.stdout.strip())
        return -1
    except subprocess.TimeoutExpired:
        return 60.0  # Timed out = definitely slow
    except Exception:
        return -1


def check_cache_health(max_import_time=MAX_IMPORT_TIME, verbose=True):
    """
    Check if FastF1 imports are healthy. If slow, clear the cache.
    
    Args:
        max_import_time: Maximum acceptable import time in seconds
        verbose: Whether to print status messages
    
    Returns:
        True if cache is healthy (or was fixed), False if unfixable
    """
    if verbose:
        print("\n🔍 Checking FastF1 cache health...")
    
    import_time = test_import_speed()
    
    if import_time < 0:
        if verbose:
            print("   ⚠️  Could not test import speed")
        return True  # Assume OK, let normal errors surface
    
    if import_time <= max_import_time:
        if verbose:
            print(f"   ✓ Cache healthy (import: {import_time:.1f}s)")
        return True
    
    # Cache appears corrupted
    if verbose:
        print(f"   ⚠️  Slow import detected ({import_time:.1f}s > {max_import_time}s)")
        print("   Clearing potentially corrupted cache...")
    
    if clear_cache():
        if verbose:
            print("   ✓ Cache cleared. Imports should be fast now.\n")
        return True
    
    if verbose:
        print("   ✗ Failed to clear cache\n")
    return False


if __name__ == '__main__':
    # Allow running as standalone script to check/fix cache
    print("FastF1 Cache Health Check")
    print("=" * 40)
    check_cache_health(verbose=True)
