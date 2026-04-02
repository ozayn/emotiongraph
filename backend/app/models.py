from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    # Stable Google subject (`sub` claim); NULL for seeded demo users (@emotiongraph.local).
    google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    # NULL = client uses browser/device IANA zone; non-null = saved override.
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class TrackerDay(Base):
    """Per-user, per-calendar-day fields (cycle, sleep)."""

    __tablename__ = "tracker_days"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    log_date: Mapped[date] = mapped_column(Date, primary_key=True)
    cycle_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)


class LogEntry(Base):
    __tablename__ = "log_entries"
    __table_args__ = (Index("ix_log_entries_user_log_date", "user_id", "log_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    log_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str | None] = mapped_column(String(32), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event: Mapped[str | None] = mapped_column(Text, nullable=True)
    energy_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anxiety: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contentment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    focus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    music: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    source_type: Mapped[str] = mapped_column(
        String(16),
        server_default=text("'manual'"),
        nullable=False,
    )
