"""Optional anger metric on log entries + inactive builtin field row.

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-04-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g3h4i5j6k7l8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("log_entries")}
    if "anger" not in cols:
        op.add_column("log_entries", sa.Column("anger", sa.Integer(), nullable=True))

    row = conn.execute(
        sa.text("SELECT id FROM tracker_field_definitions WHERE scope = 'entry' AND key = 'anger' LIMIT 1")
    ).fetchone()
    if row is not None:
        return

    n_defs = conn.execute(sa.text("SELECT COUNT(*) FROM tracker_field_definitions")).scalar() or 0
    if n_defs == 0:
        # Fresh DB: seed_tracker_config_if_empty will create all builtins including anger.
        return

    dialect = conn.dialect.name
    if dialect == "postgresql":
        conn.execute(
            sa.text(
                """
                INSERT INTO tracker_field_definitions
                    (is_builtin, key, label, scope, field_type, is_required, is_active, display_order)
                VALUES
                    (true, 'anger', 'Anger', 'entry', 'select', false, false, 75)
                """
            )
        )
    else:
        conn.execute(
            sa.text(
                """
                INSERT INTO tracker_field_definitions
                    (is_builtin, key, label, scope, field_type, is_required, is_active, display_order)
                VALUES
                    (1, 'anger', 'Anger', 'entry', 'select', 0, 0, 75)
                """
            )
        )
    fid_row = conn.execute(
        sa.text("SELECT id FROM tracker_field_definitions WHERE scope = 'entry' AND key = 'anger' LIMIT 1")
    ).fetchone()
    if fid_row is None:
        return
    fid = fid_row[0]

    opts = [
        ("", "—", 0),
        ("0", "0 — Not at all", 10),
        ("1", "1 — A little", 20),
        ("2", "2 — Moderately", 30),
        ("3", "3 — Very much", 40),
    ]
    for val, lab, ord_ in opts:
        conn.execute(
            sa.text(
                """
                INSERT INTO tracker_select_options
                    (field_definition_id, value, label, display_order, is_active)
                VALUES
                    (:fid, :val, :lab, :ord_, :is_active)
                """
            ),
            {"fid": fid, "val": val, "lab": lab, "ord_": ord_, "is_active": True},
        )


def downgrade() -> None:
    conn = op.get_bind()
    row = conn.execute(
        sa.text("SELECT id FROM tracker_field_definitions WHERE scope = 'entry' AND key = 'anger' LIMIT 1")
    ).fetchone()
    if row is not None:
        fid = row[0]
        conn.execute(sa.text("DELETE FROM tracker_select_options WHERE field_definition_id = :fid"), {"fid": fid})
        conn.execute(
            sa.text("DELETE FROM tracker_field_definitions WHERE id = :fid AND key = 'anger'"),
            {"fid": fid},
        )
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("log_entries")}
    if "anger" in cols:
        op.drop_column("log_entries", "anger")
