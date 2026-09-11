.PHONY: setup dev backend frontend test lint format docker-up docker-down

setup:
	./scripts/setup.sh

dev:
	./scripts/dev.sh

backend:
	cd backend && uv run uvicorn app.main:app --reload

frontend:
	cd frontend && npm run dev

test:
	./scripts/test.sh

lint:
	./scripts/lint.sh

format:
	cd backend && uv run ruff format .
	cd ml && uv run ruff format .
	cd frontend && npx eslint --fix .

docker-up:
	docker compose up --build

docker-down:
	docker compose down
