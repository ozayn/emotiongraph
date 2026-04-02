"""Phase 1 custom tracker fields: is_builtin + EAV value tables.

Revision ID: f2a3b4c5d6e7
Revises: e8f9a0b1c2d3
Create Date: 2026-04-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tfd_cols = {c["name"] for c in insp.get_columns("tracker_field_definitions")}
    if "is_builtin" not in tfd_cols:
        op.add_column(
            "tracker_field_definitions",
            sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )
        op.alter_column("tracker_field_definitions", "is_builtin", server_default=sa.text("false"))

    if not insp.has_table("log_entry_custom_values"):
        op.create_table(
            "log_entry_custom_values",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("log_entry_id", sa.Integer(), nullable=False),
            sa.Column("field_definition_id", sa.Integer(), nullable=False),
            sa.Column("value_text", sa.Text(), nullable=True),
            sa.Column("value_number", sa.Float(), nullable=True),
            sa.Column("select_option_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["field_definition_id"], ["tracker_field_definitions.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["log_entry_id"], ["log_entries.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["select_option_id"], ["tracker_select_options.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("log_entry_id", "field_definition_id", name="uq_log_entry_custom_field"),
        )
        op.create_index(
            op.f("ix_log_entry_custom_values_field_definition_id"),
            "log_entry_custom_values",
            ["field_definition_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_log_entry_custom_values_log_entry_id"),
            "log_entry_custom_values",
            ["log_entry_id"],
            unique=False,
        )

    if not insp.has_table("tracker_day_custom_values"):
        op.create_table(
            "tracker_day_custom_values",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("log_date", sa.Date(), nullable=False),
            sa.Column("field_definition_id", sa.Integer(), nullable=False),
            sa.Column("value_text", sa.Text(), nullable=True),
            sa.Column("value_number", sa.Float(), nullable=True),
            sa.Column("select_option_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(
                ["field_definition_id"],
                ["tracker_field_definitions.id"],
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["select_option_id"],
                ["tracker_select_options.id"],
                ondelete="RESTRICT",
            ),
            sa.ForeignKeyConstraint(
                ["user_id", "log_date"],
                ["tracker_days.user_id", "tracker_days.log_date"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "log_date", "field_definition_id", name="uq_tracker_day_custom_field"),
        )
        op.create_index(
            op.f("ix_tracker_day_custom_values_field_definition_id"),
            "tracker_day_custom_values",
            ["field_definition_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_tracker_day_custom_values_user_id"),
            "tracker_day_custom_values",
            ["user_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_tracker_day_custom_values_user_id"), table_name="tracker_day_custom_values")
    op.drop_index(op.f("ix_tracker_day_custom_values_field_definition_id"), table_name="tracker_day_custom_values")
    op.drop_table("tracker_day_custom_values")
    op.drop_index(op.f("ix_log_entry_custom_values_log_entry_id"), table_name="log_entry_custom_values")
    op.drop_index(op.f("ix_log_entry_custom_values_field_definition_id"), table_name="log_entry_custom_values")
    op.drop_table("log_entry_custom_values")
    op.drop_column("tracker_field_definitions", "is_builtin")
