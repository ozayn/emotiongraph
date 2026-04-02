"""users.timezone nullable — null means client uses device/browser zone.

Revision ID: a3c7e9b2f1d4
Revises: 695619ad8629
Create Date: 2026-04-02

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c7e9b2f1d4"
down_revision: Union[str, Sequence[str], None] = "695619ad8629"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.alter_column(
                "timezone",
                existing_type=sa.String(length=64),
                nullable=True,
                existing_nullable=False,
                server_default=None,
            )
    else:
        op.alter_column(
            "users",
            "timezone",
            existing_type=sa.String(length=64),
            nullable=True,
            server_default=None,
        )


def downgrade() -> None:
    op.execute(sa.text("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL"))
    bind = op.get_bind()
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
            server_default=sa.text("'UTC'"),
        )
