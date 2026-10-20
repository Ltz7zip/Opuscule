PYTHON ?= .venv/bin/python

.PHONY: test compile serve-design budget ci ui-check

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests -v

compile:
	$(PYTHON) -m compileall -q src tests main.py

serve-design:
	$(PYTHON) -m http.server 8000 --directory .design/current

budget:
	cd frontend && npm run build && npm run check:budget

ui-check:
	$(PYTHON) scripts/check_ui.py

ci:
	bash scripts/ci.sh
