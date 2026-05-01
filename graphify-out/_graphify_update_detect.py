import sys, json
from graphify.detect import detect_incremental
from pathlib import Path

result = detect_incremental(Path('.'))
Path('graphify-out/.graphify_incremental.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
if result.get('new_total', 0) == 0:
    print('No files changed since last run. Nothing to update.')
else:
    print(f"{result.get('new_total')} new/changed file(s) to re-extract.")
