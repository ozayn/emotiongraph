"""users.timezone nullable — null means client uses device/browser zone.

Revision ID: a3c7e9b2f1d4
Revises: 695619ad8629
Create Date: 2026-04-02

Older production databases may have ``users`` from pre-Alembic / partial migrations without a
``timezone`` column. This revision adds the column when missing, otherwise alters it to nullable.

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

# revision identifiers, used by Alembic.
revision: str = "a3c7e9b2f1d4"
down_revision: Union[str, Sequence[str], None] = "695619ad8629"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    if not insp.has_table("users"):
        return

    cols = insp.get_columns("users")
    names = {c["name"] for c in cols}

    if "timezone" not in names:
        op.add_column(
            "users",
            sa.Column("timezone", sa.String(length=64), nullable=True),
        )
        return

    tz = next(c for c in cols if c["name"] == "timezone")

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.alter_column(
                "timezone",
                existing_type=sa.String(length=64),
                nullable=True,
                existing_nullable=bool(tz.get("nullable")),
                server_default=None,
            )
    else:
        op.alter_column(
            "users",
            "timezone",
            existing_type=sa.String(length=64),
            nullable=True,
            existing_nullable=bool(tz.get("nullable")),
            server_default=None,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    if not insp.has_table("users"):
        return
    if "timezone" not in {c["name"] for c in insp.get_columns("users")}:
        return

    op.execute(sa.text("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL"))

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.alter_column(
                "timezone",
                existing_type=sa.String(length=64),
                nullable=False,
                existing_nullable=True,
                server_default=sa.text("'UTC'"),
            )
    else:
        op.alter_column(
            "users",
            "timezone",
            existing_type=sa.String(length=64),
            nullable=False,
            existing_nullable=True,
            server_default=sa.text("'UTC'"),
        )
