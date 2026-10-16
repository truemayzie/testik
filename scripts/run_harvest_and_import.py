import subprocess
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON_EXE = os.path.join(ROOT_DIR, 'backend', 'venv', 'Scripts', 'python.exe')
HARVEST_SCRIPT = os.path.join(ROOT_DIR, 'scripts', 'harvest_all_topics.py')
IMPORT_SCRIPT = os.path.join(ROOT_DIR, 'frontend', 'scripts', 'import-harvested-topics.js')

print(f'=== Starting Full Topic Harvester ===')
print(f'Root: {ROOT_DIR}')
print(f'Python: {PYTHON_EXE}')

# Run harvest
t0 = time.time()
p_harvest = subprocess.run([PYTHON_EXE, HARVEST_SCRIPT], cwd=ROOT_DIR)

print(f'\nHarvest process exited with code {p_harvest.returncode} in {time.time() - t0:.1f}s')

# Run import into database
print(f'\n=== Running Bulk Importer into Database ===')
p_import = subprocess.run(['node', IMPORT_SCRIPT], cwd=os.path.join(ROOT_DIR, 'frontend'))

print(f'Import process exited with code {p_import.returncode}')
print('All done!')
