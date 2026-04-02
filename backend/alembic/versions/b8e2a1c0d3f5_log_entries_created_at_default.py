"""log_entries.created_at server default — fixes NOT NULL without DEFAULT on legacy DBs.

Revision ID: b8e2a1c0d3f5
Revises: a3c7e9b2f1d4
Create Date: 2026-04-02

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.exc import OperationalError

revision: str = "b8e2a1c0d3f5"
down_revision: Union[str, Sequence[str], None] = "a3c7e9b2f1d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    if not insp.has_table("log_entries"):
        return
    names = {c["name"] for c in insp.get_columns("log_entries")}
    if "created_at" not in names:
        return
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute(text("ALTER TABLE log_entries ALTER COLUMN created_at SET DEFAULT NOW()"))
    elif dialect == "sqlite":
        # SQLite 3.35+; PG-style ALTER … NOW() is invalid on SQLite.
        try:
            op.execute(
                text(
                    "ALTER TABLE log_entries ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP"
                )
            )
        except OperationalError:
            pass
    else:
        try:
            op.execute(
                text(
                    "ALTER TABLE log_entries ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP"
                )
            )
        except OperationalError:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    if not insp.has_table("log_entries"):
        return
    names = {c["name"] for c in insp.get_columns("log_entries")}
    if "created_at" not in names:
        return
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute(text("ALTER TABLE log_entries ALTER COLUMN created_at DROP DEFAULT"))
    elif dialect == "sqlite":
        try:
            op.execute(text("ALTER TABLE log_entries ALTER COLUMN created_at DROP DEFAULT"))
        except OperationalError:
            pass
    else:
        try:
            op.execute(text("ALTER TABLE log_entries ALTER COLUMN created_at DROP DEFAULT"))
        except OperationalError:
            pass
