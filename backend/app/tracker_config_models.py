"""Configurable tracker field definitions and select options (admin-driven)."""

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TrackerFieldDefinition(Base):
    __tablename__ = "tracker_field_definitions"
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_tracker_field_scope_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(256), nullable=False)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    options: Mapped[list["TrackerSelectOption"]] = relationship(
        "TrackerSelectOption",
        back_populates="field",
        cascade="all, delete-orphan",
        order_by="TrackerSelectOption.display_order",
    )


class TrackerSelectOption(Base):
    __tablename__ = "tracker_select_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_definition_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tracker_field_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value: Mapped[str] = mapped_column(String(256), nullable=False)
    label: Mapped[str] = mapped_column(String(512), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    field: Mapped["TrackerFieldDefinition"] = relationship("TrackerFieldDefinition", back_populates="options")
