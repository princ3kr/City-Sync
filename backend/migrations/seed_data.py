"""
CitySync — Seed data for wards, departments, routes, and severity overrides.
Uses realistic Mumbai ward boundaries and Indian municipal department structure.

Run: python backend/migrations/seed_data.py
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from shared.config import settings
from shared.database import Base
import shared.models as m


# ── Mumbai Ward Boundaries (approximate, for demo) ────────────────────────────
# Using simplified polygon coordinates around Mumbai wards
WARDS = [
    {
        "id": "MUM-A",
        "name": "A Ward (Colaba & Fort)",
        "city": "Mumbai",
        "centroid": (72.8347, 18.9217),
        "boundary_wkt": "POLYGON((72.82 18.90, 72.85 18.90, 72.85 18.94, 72.82 18.94, 72.82 18.90))",
    },
    {
        "id": "MUM-D",
        "name": "D Ward (Malabar Hill)",
        "city": "Mumbai",
        "centroid": (72.7946, 18.9596),
        "boundary_wkt": "POLYGON((72.78 18.94, 72.81 18.94, 72.81 18.98, 72.78 18.98, 72.78 18.94))",
    },
    {
        "id": "MUM-K-E",
        "name": "K/E Ward (Andheri East)",
        "city": "Mumbai",
        "centroid": (72.8697, 19.1136),
        "boundary_wkt": "POLYGON((72.85 19.09, 72.89 19.09, 72.89 19.13, 72.85 19.13, 72.85 19.09))",
    },
    {
        "id": "MUM-K-W",
        "name": "K/W Ward (Andheri West)",
        "city": "Mumbai",
        "centroid": (72.8369, 19.1290),
        "boundary_wkt": "POLYGON((72.82 19.11, 72.85 19.11, 72.85 19.15, 72.82 19.15, 72.82 19.11))",
    },
    {
        "id": "MUM-H-E",
        "name": "H/E Ward (Santacruz East)",
        "city": "Mumbai",
        "centroid": (72.8447, 19.0770),
        "boundary_wkt": "POLYGON((72.83 19.06, 72.86 19.06, 72.86 19.10, 72.83 19.10, 72.83 19.06))",
    },
]

# ── Departments ────────────────────────────────────────────────────────────────
DEPARTMENTS = [
    {"id": str(uuid.uuid4()), "name": "Roads & Infrastructure", "code": "ROADS",
     "email": "roads@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/roads"},
    {"id": str(uuid.uuid4()), "name": "Storm Water Drains (SWD)", "code": "SWD",
     "email": "swd@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/swd"},
    {"id": str(uuid.uuid4()), "name": "Street Lighting", "code": "LIGHTS",
     "email": "lights@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/lights"},
    {"id": str(uuid.uuid4()), "name": "Solid Waste Management", "code": "SWM",
     "email": "swm@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/swm"},
    {"id": str(uuid.uuid4()), "name": "Hydraulic Engineering (Water Supply)", "code": "HYD",
     "email": "water@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/water"},
    {"id": str(uuid.uuid4()), "name": "Electricity Emergency Cell", "code": "ELEC_EMG",
     "email": "livewire@bestenergy.in", "webhook_url": "http://dept-portal:3000/webhook/emergency"},
    {"id": str(uuid.uuid4()), "name": "Fire Brigade & Rescue", "code": "FIRE",
     "email": "fire@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/fire"},
    {"id": str(uuid.uuid4()), "name": "Building & Factories", "code": "BLDG",
     "email": "buildings@bmc.gov.in", "webhook_url": "http://dept-portal:3000/webhook/buildings"},
]
# ── Category → Department mapping (category + NULL ward = default for all wards)
CATEGORY_DEPARTMENT_MAP = {
    "Pothole": "ROADS",
    "Flooding": "SWD",
    "Drainage": "SWD",
    "Street Light": "LIGHTS",
    "Garbage": "SWM",
    "Water Supply": "HYD",
    "Building Hazard": "BLDG",
    "Live Wire": "ELEC_EMG",
    "Noise": "ROADS",
    "Other": "ROADS",
}

# ── Severity overrides (emergency bypass) ─────────────────────────────────────
SEVERITY_OVERRIDES = [
    {
        "category": "Live Wire",
        "min_severity": 7,
        "department_code": "ELEC_EMG",
        "bypass_ward": True,
        "reason": "Live wire is public safety emergency — bypass ward routing",
    },
    {
        "category": "Building Hazard",
        "min_severity": 9,
        "department_code": "FIRE",
        "bypass_ward": True,
        "reason": "Building collapse imminent — Fire & Rescue takes priority",
    },
    {
        "category": "Flooding",
        "min_severity": 8,
        "department_code": "SWD",
        "bypass_ward": False,
        "reason": "Severe flooding — escalated priority",
    },
]


async def seed():
    print("🌱 CitySync — Seeding Data")

    engine = create_async_engine(settings.database_url, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as session:
        # ── 1. Seed wards ──────────────────────────────────────────────────────
        print("🗺  Seeding wards...")
        for ward_data in WARDS:
            existing = await session.get(m.Ward, ward_data["id"])
            if not existing:
                ward = m.Ward(
                    id=ward_data["id"],
                    name=ward_data["name"],
                    city=ward_data["city"],
                )
                session.add(ward)
        await session.flush()

        # Set boundaries using raw SQL (GeoAlchemy2 WKT)
        for ward_data in WARDS:
            await session.execute(
                text("""
                    UPDATE wards
                    SET boundary = ST_GeogFromText(:wkt)
                    WHERE id = :id
                """),
                {"wkt": ward_data["boundary_wkt"], "id": ward_data["id"]},
            )
        print(f"   ✓ {len(WARDS)} wards seeded")

        # ── 2. Seed departments ────────────────────────────────────────────────
        print("🏢 Seeding departments...")
        dept_by_code = {}
        for dept_data in DEPARTMENTS:
            existing = await session.execute(
                text("SELECT id FROM departments WHERE code = :code"),
                {"code": dept_data["code"]},
            )
            row = existing.fetchone()
            if row:
                # Update webhook_url for existing departments
                await session.execute(
                    text("UPDATE departments SET webhook_url = :url WHERE code = :code"),
                    {"url": dept_data["webhook_url"], "code": dept_data["code"]},
                )
                dept_by_code[dept_data["code"]] = str(row[0])
            else:
                dept = m.Department(
                    id=dept_data["id"],
                    name=dept_data["name"],
                    code=dept_data["code"],
                    email=dept_data.get("email"),
                    webhook_url=dept_data.get("webhook_url"),
                )
                session.add(dept)
                dept_by_code[dept_data["code"]] = dept_data["id"]
        await session.flush()
        print(f"   ✓ {len(DEPARTMENTS)} departments seeded")

        # ── 3. Seed department routes ──────────────────────────────────────────
        print("🔀 Seeding department routes...")
        route_count = 0
        for category, dept_code in CATEGORY_DEPARTMENT_MAP.items():
            dept_id = dept_by_code[dept_code]
            # Upsert route
            await session.execute(
                text("""
                    INSERT INTO department_routes (id, category, ward_id, primary_department_id)
                    VALUES (:id, :cat, NULL, :dept_id)
                    ON CONFLICT (category, ward_id) DO UPDATE SET primary_department_id = EXCLUDED.primary_department_id
                """),
                {"id": str(uuid.uuid4()), "cat": category, "dept_id": dept_id},
            )
            route_count += 1
        await session.flush()
        print(f"   ✓ {route_count} routes seeded")

        # ── 4. Seed severity overrides ─────────────────────────────────────────
        print("⚠️  Seeding severity overrides...")
        override_count = 0
        for override_data in SEVERITY_OVERRIDES:
            dept_id = dept_by_code[override_data["department_code"]]
            # Manual check instead of ON CONFLICT due to missing schema constraint
            existing = await session.execute(
                text("SELECT id FROM severity_overrides WHERE category = :cat AND min_severity = :sev"),
                {"cat": override_data["category"], "sev": override_data["min_severity"]},
            )
            if not existing.fetchone():
                await session.execute(
                    text("""
                        INSERT INTO severity_overrides (id, category, min_severity, department_id, bypass_ward, reason)
                        VALUES (:id, :cat, :sev, :dept_id, :bypass, :reason)
                    """),
                    {
                        "id": str(uuid.uuid4()),
                        "cat": override_data["category"],
                        "sev": override_data["min_severity"],
                        "dept_id": dept_id,
                        "bypass": override_data["bypass_ward"],
                        "reason": override_data["reason"],
                    },
                )
                override_count += 1
        await session.flush()
        print(f"   ✓ {override_count} severity overrides seeded")

        # ── 5. Seed Sample Tickets (New!) ──────────────────────────────────────
        print("🎫 Seeding sample tickets for demo...")
        
        # Helper to generate citizen tokens
        demo_citizen = "8f4a3c2b1e9d8f7a6c5b4e3d2f1a0987c6b5a4d3e2f1c0b9a8d7e6f5c4b3a2d1"

        SAMPLE_TICKETS = [
            {
                "id": "TKT-DEMO-001",
                "category": "Pothole",
                "description": "Massive pothole at SV Road Junction. Causing major traffic snarls.",
                "status": "Resolved",
                "severity": 8,
                "tier": "High",
                "score": 85.0,
                "lat": 19.1136, "lng": 72.8697, # Andheri East
                "ward": "MUM-K-E",
                "dept": "ROADS"
            },
            {
                "id": "TKT-DEMO-002",
                "category": "Drainage",
                "description": "Overflowing drain near Malabar Hill Park. Foul smell in the area.",
                "status": "In Progress",
                "severity": 6,
                "tier": "Medium",
                "score": 55.0,
                "lat": 18.9596, "lng": 72.7946, # Malabar Hill
                "ward": "MUM-D",
                "dept": "SWD"
            },
            {
                "id": "TKT-DEMO-003",
                "category": "Street Light",
                "description": "Three street lights are out near Colaba Causeway. Unsafe at night.",
                "status": "Pending",
                "severity": 4,
                "tier": "Low",
                "score": 30.0,
                "lat": 18.9217, "lng": 72.8347, # Colaba
                "ward": "MUM-A",
                "dept": "LIGHTS"
            }
        ]

        for t_data in SAMPLE_TICKETS:
            existing = await session.get(m.Ticket, t_data["id"])
            if not existing:
                ticket = m.Ticket(
                    id=t_data["id"],
                    category=t_data["category"],
                    description=t_data["description"],
                    status=t_data["status"],
                    severity=t_data["severity"],
                    severity_tier=t_data["tier"],
                    priority_score=t_data["score"],
                    ward_id=t_data["ward"],
                    department_id=dept_by_code[t_data["dept"]],
                    citizen_token=demo_citizen,
                    submitted_at=datetime.now(timezone.utc),
                )
                session.add(ticket)
                await session.flush()
                
                # Set GPS
                await session.execute(
                    text("UPDATE tickets SET fuzzed_gps = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography WHERE id = :id"),
                    {"id": t_data["id"], "lat": t_data["lat"], "lng": t_data["lng"]}
                )

                # If Resolved, create resolution log
                if t_data["status"] == "Resolved":
                    res_id = str(uuid.uuid4())
                    res_log = m.ResolutionLog(
                        id=res_id,
                        ticket_id=t_data["id"],
                        resolution_method="verified",
                        reason="Repair completed and verified by citizen.",
                        resolved_at=datetime.now(timezone.utc)
                    )
                    session.add(res_log)
                    await session.flush()
                    await session.execute(
                        text("UPDATE tickets SET resolution_log_id = :res_id WHERE id = :id"),
                        {"res_id": res_id, "id": t_data["id"]}
                    )

        await session.commit()
        print("   ✓ 3 sample tickets seeded")

    print()
    print("✅ Seed data complete!")
    print()
    print("Departments seeded:")
    for d in DEPARTMENTS:
        print(f"  • {d['code']:12} → {d['name']}")
    print()
    print("Ward → webhook URL:")
    print("  All categories route to → http://localhost:3000/webhook/{dept_code}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
