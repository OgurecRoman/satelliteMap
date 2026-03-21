from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.analysis import (
    CompareGroupsRequest,
    CompareGroupsResponse,
    GroupingResponse,
    PointPassRequest,
    PointPassResponse,
    RegionPassRequest,
    RegionPassResponse,
)
from app.services.analysis_service import AnalysisService

router = APIRouter()


@router.get("/grouping", response_model=GroupingResponse, summary="Group satellites by field")
def grouping(field: str = Query(...), db: Session = Depends(get_db)):
    return AnalysisService(db).grouping(field)


@router.post("/passes-over-point", response_model=PointPassResponse, summary="Find passes over point")
def passes_over_point(payload: PointPassRequest, db: Session = Depends(get_db)):
    return AnalysisService(db).passes_over_point(payload)


@router.post("/passes-over-region", response_model=RegionPassResponse, summary="Find passes over region")
def passes_over_region(payload: RegionPassRequest, db: Session = Depends(get_db)):
    return AnalysisService(db).passes_over_region(payload)


@router.post("/compare-groups", response_model=CompareGroupsResponse, summary="Compare groups of satellites")
def compare_groups(payload: CompareGroupsRequest, db: Session = Depends(get_db)):
    return AnalysisService(db).compare_groups(payload)
