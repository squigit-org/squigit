# Codex Workspace Notes

This repository keeps Codex automation assets under `.codex/` (not under `ui/`).

## Layout

- `.codex/tools/`: repo-level utility scripts
- `.codex/reports/`: generated analysis outputs and patch previews

## Color Tokenizer

- Script: `.codex/tools/color_tokenizer.py`
- Source scan scope: `ui/src/**/*.module.css` and `ui/src/**/*.tsx`
- Existing token reuse source: `ui/src/styles/variables.css`

### Commands

```bash
python3 .codex/tools/color_tokenizer.py --report
python3 .codex/tools/color_tokenizer.py --apply
python3 .codex/tools/color_tokenizer.py --write
```

### Outputs

- `.codex/reports/color-map.json`
- `.codex/reports/color-report.md`
- `.codex/reports/color-tokenization.patch`
- `ui/src/styles/variables.generated.css`
