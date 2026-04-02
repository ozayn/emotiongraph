"""EAV storage for admin-defined (non-builtin) tracker fields."""

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, ForeignKeyConstraint, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LogEntryCustomValue(Base):
    __tablename__ = "log_entry_custom_values"
    __table_args__ = (
        UniqueConstraint("log_entry_id", "field_definition_id", name="uq_log_entry_custom_field"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    log_entry_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("log_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_definition_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tracker_field_definitions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_number: Mapped[float | None] = mapped_column(Float, nullable=True)
    select_option_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("tracker_select_options.id", ondelete="RESTRICT"),
        nullable=True,
    )


class TrackerDayCustomValue(Base):
    __tablename__ = "tracker_day_custom_values"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "log_date"],
            ["tracker_days.user_id", "tracker_days.log_date"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("user_id", "log_date", "field_definition_id", name="uq_tracker_day_custom_field"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    field_definition_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tracker_field_definitions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_number: Mapped[float | None] = mapped_column(Float, nullable=True)
    select_option_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("tracker_select_options.id", ondelete="RESTRICT"),
        nullable=True,
    )
