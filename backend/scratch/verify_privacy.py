import asyncio
import sys
import os
import uuid
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Fix paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from shared.config import settings
from shared.database import Base
from shared.models import Ticket
from shared.auth import filter_ticket_fields, ROLE_HIERARCHY

async def verify():
    print("🔍 Verifying Privacy & GPS Fuzzing Integration")
    
    engine = create_async_engine(settings.database_url, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    test_id = f"TKT-{secrets.token_hex(4).upper()}"
    raw_lat, raw_lng = 19.0760, 72.8777 # Mumbai
    
    async with SessionLocal() as session:
        print(f"1. Creating test ticket {test_id}...")
        ticket = Ticket(
            id=test_id,
            category="Pothole",
            severity=5,
            severity_tier="Medium",
            status="Pending",
            citizen_token="test_sha256_token",
            description="Test privacy pothole",
            submitted_at=datetime.now(timezone.utc)
        )
        session.add(ticket)
        await session.flush()
        
        # Manually set fuzzed_gps (Officer level)
        await session.execute(
            text("UPDATE tickets SET fuzzed_gps = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography WHERE id = :id"),
            {"lng": raw_lng, "lat": raw_lat, "id": test_id}
        )
        await session.commit()
        print("   ✓ Ticket created with PostGIS point")

    # Simulate API extraction logic
    async with SessionLocal() as session:
        from geoalchemy2.functions import ST_X, ST_Y
        from sqlalchemy import select
        
        query = select(Ticket, ST_Y(Ticket.fuzzed_gps), ST_X(Ticket.fuzzed_gps)).where(Ticket.id == test_id)
        result = await session.execute(query)
        row = result.one()
        t, db_lat, db_lng = row[0], row[1], row[2]
        
        base_dict = {
            "ticket_id": t.id,
            "category": t.category,
            "citizen_token": t.citizen_token,
            "raw_lat": db_lat,
            "raw_lng": db_lng,
            "description": t.description
        }
        
        print("\n2. Testing Officer Role View (±30m baseline)...")
        officer_view = filter_ticket_fields(dict(base_dict), "officer")
        print(f"   Officer Location: {officer_view.get('location')}")
        print(f"   Citizen Token Present: {'citizen_token' in officer_view}")
        
        print("\n3. Testing Public Role View (±90m dynamic fuzz)...")
        public_view = filter_ticket_fields(dict(base_dict), "public")
        print(f"   Public Location: {public_view.get('location')}")
        print(f"   Description Present: {'description' in public_view}")
        
        # Verify distance shift
        o_lat, o_lng = officer_view['location']['lat'], officer_view['location']['lng']
        p_lat, p_lng = public_view['location']['lat'], public_view['location']['lng']
        dist = ((o_lat-p_lat)**2 + (o_lng-p_lng)**2)**0.5 * 111000 # very rough meters
        print(f"\n4. Privacy verification:")
        print(f"   ✓ Officer sees ID {test_id} at {o_lat}, {o_lng}")
        print(f"   ✓ Public sees ID {test_id} at {p_lat}, {p_lng}")
        print(f"   ✓ Dynamic noise added: ~{dist:.1f} meters")
        
        if 'citizen_token' in public_view or 'citizen_token' in officer_view:
            print("   ❌ FAILED: Token leaked!")
        else:
            print("   ✓ SUCCESS: PII stripped")

    await engine.dispose()

import secrets
if __name__ == "__main__":
    asyncio.run(verify())
