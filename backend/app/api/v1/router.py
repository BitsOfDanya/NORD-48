from fastapi import APIRouter

from app.api.v1 import (
    comparisons,
    economics,
    health,
    optimization,
    resilience,
    routes,
    scenarios,
    simulations,
)

router = APIRouter()

router.include_router(health.router)
router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
router.include_router(simulations.router, prefix="/simulations", tags=["simulations"])
router.include_router(routes.router, prefix="/routes", tags=["routes"])
router.include_router(comparisons.router, prefix="/comparisons", tags=["comparisons"])
router.include_router(resilience.router, prefix="/resilience", tags=["resilience"])
router.include_router(optimization.router, prefix="/optimization", tags=["optimization"])
router.include_router(economics.router, prefix="/economics", tags=["economics"])
