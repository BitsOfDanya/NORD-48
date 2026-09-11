from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "nord48-api"}


@router.get("/info")
async def info() -> dict:
    settings = get_settings()
    return {
        "name": settings.app_name,
        "api_version": "v1",
        "environment": settings.app_env,
    }
