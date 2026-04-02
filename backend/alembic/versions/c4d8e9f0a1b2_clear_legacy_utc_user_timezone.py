"""Clear legacy UTC placeholder on users.timezone (use device zone on client).

Revision ID: c4d8e9f0a1b2
Revises: b8e2a1c0d3f5
Create Date: 2026-04-01

Older schemas used NOT NULL DEFAULT 'UTC' for users.timezone. That was not a deliberate
preference: the client treated it like a saved zone and computed capture_time_local in UTC
while the user was in a local zone (e.g. ~4h offset for US Eastern).

NULL means “follow device/browser” (see Preferences). Users who truly want UTC can pick
“UTC” again in Preferences (re-saves the override).

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision: str = "c4d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b8e2a1c0d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    if not insp.has_table("users"):
        return
    names = {c["name"] for c in insp.get_columns("users")}
    if "timezone" not in names:
        return
    op.execute(
        sa.text("UPDATE users SET timezone = NULL WHERE timezone IN ('UTC', 'Etc/UTC')"),
    )


def downgrade() -> None:
    # Cannot know which NULLs were previously UTC placeholders.
    pass
