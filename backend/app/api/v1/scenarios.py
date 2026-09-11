"""Scenario endpoints: bundled examples and JSON upload.

Errors (`ScenarioNotFoundError`, `InvalidScenarioError`) are translated to
HTTP responses by the global handlers in `app.main`.
"""

from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.services import scenario_service

router = APIRouter(tags=["scenarios"])


@router.get("/examples")
async def list_examples() -> list[dict]:
    return scenario_service.list_examples()


@router.get("/examples/{scenario_id}")
async def get_example(scenario_id: str) -> dict:
    return scenario_service.get_example(scenario_id)


@router.post("/upload")
async def upload_scenario(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    return scenario_service.load_uploaded_scenario(raw)
