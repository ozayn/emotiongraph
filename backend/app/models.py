from datetime import date

from sqlalchemy import Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LogEntry(Base):
    __tablename__ = "log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str | None] = mapped_column(String(32), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    energy_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anxiety: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contentment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    focus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    music: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
