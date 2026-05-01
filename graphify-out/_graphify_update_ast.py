import json
from pathlib import Path
from graphify.extract import collect_files, extract

inc = json.loads(Path('graphify-out/.graphify_incremental.json').read_text())
all_changed = [f for files in inc.get('new_files', {}).values() for f in files]

code_files = []
for f in all_changed:
    p = Path(f)
    if p.suffix == '' and p.is_dir():
        code_files.extend(collect_files(p))
    else:
        code_files.append(p)

if code_files:
    result = extract(code_files, cache_root=Path('.'))
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps(result, indent=2))
    print(f"AST: {len(result['nodes'])} nodes, {len(result['edges'])} edges")
else:
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps({'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}))
    print('No code files - skipping AST extraction')
