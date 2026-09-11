from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import router as api_router
from app.core.config import get_settings
from app.core.exceptions import (
    InvalidScenarioError,
    ScenarioNotFoundError,
    SimulationNotFoundError,
)
from app.core.logging import configure_logging

settings = get_settings()
configure_logging()

app = FastAPI(
    title=settings.app_name,
    description="NORD-48 — Satellite Constellation Resilience Workbench API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ScenarioNotFoundError)
async def scenario_not_found_handler(request: Request, exc: ScenarioNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(SimulationNotFoundError)
async def simulation_not_found_handler(
    request: Request, exc: SimulationNotFoundError
) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(InvalidScenarioError)
async def invalid_scenario_handler(request: Request, exc: InvalidScenarioError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
async def root() -> dict:
    return {"service": settings.app_name, "docs": "/docs"}
