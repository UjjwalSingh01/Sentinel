"""
Sentinel — Standalone Seed Script

Creates demo users in the database. Can be run independently:
    python scripts/seed.py

Or it runs automatically as part of the API service startup.
"""

import asyncio
import os
import sys
import uuid

import asyncpg
from passlib.context import CryptContext

DATABASE_URL = os.getenv(
    "DATABASE_URL_SYNC",
    "postgresql://sentinel:sentinel_secret@localhost:5432/sentinel",
)

# Convert to asyncpg-compatible DSN
ASYNCPG_DSN = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_USERS = [
    {
        "id": str(uuid.uuid4()),
        "email": "admin@sentinel.io",
        "name": "Admin User",
        "role": "admin",
        "password": "sentinel123",
    },
    {
        "id": str(uuid.uuid4()),
        "email": "alice@sentinel.io",
        "name": "Alice Chen",
        "role": "engineer",
        "password": "sentinel123",
    },
    {
        "id": str(uuid.uuid4()),
        "email": "bob@sentinel.io",
        "name": "Bob Martinez",
        "role": "engineer",
        "password": "sentinel123",
    },
    {
        "id": str(uuid.uuid4()),
        "email": "carol@sentinel.io",
        "name": "Carol Park",
        "role": "viewer",
        "password": "sentinel123",
    },
]


async def seed() -> None:
    """Create demo users if the users table is empty."""
    conn = await asyncpg.connect(dsn=ASYNCPG_DSN)

    try:
        # Check if users exist
        count = await conn.fetchval("SELECT COUNT(*) FROM users")
        if count and count > 0:
            print(f"[seed] Skipping - {count} users already exist")
            return

        for user in DEMO_USERS:
            hashed = pwd_context.hash(user["password"])
            await conn.execute(
                """
                INSERT INTO users (id, email, name, role, hashed_password)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING
                """,
                user["id"],
                user["email"],
                user["name"],
                user["role"],
                hashed,
            )
            print(f"[seed] Created user: {user['email']} ({user['role']})")

        print(f"[seed] Done - {len(DEMO_USERS)} demo users created")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed())
