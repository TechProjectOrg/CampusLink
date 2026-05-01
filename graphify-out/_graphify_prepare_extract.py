import json
from pathlib import Path

ast = json.loads(Path('graphify-out/.graphify_ast.json').read_text()) if Path('graphify-out/.graphify_ast.json').exists() else {'nodes':[], 'edges':[], 'input_tokens':0, 'output_tokens':0}

new_extraction = {
    'nodes': ast.get('nodes', []),
    'edges': ast.get('edges', []),
    'hyperedges': [],
    'input_tokens': ast.get('input_tokens', 0),
    'output_tokens': ast.get('output_tokens', 0),
}

Path('graphify-out/.graphify_extract.json').write_text(json.dumps(new_extraction, indent=2))
print(f"Prepared .graphify_extract.json: {len(new_extraction['nodes'])} nodes, {len(new_extraction['edges'])} edges")
