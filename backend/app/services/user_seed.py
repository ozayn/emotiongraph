from sqlalchemy.orm import Session

from app.models import User

USER_SEED_SPECS: tuple[tuple[str, str], ...] = (
    ("Azin", "azin@emotiongraph.local"),
    ("Zahra", "zahra@emotiongraph.local"),
    ("Test", "test@emotiongraph.local"),
)

# Public `/demo` API (`X-Public-Demo: 1`) only lists and allows this seeded user.
DEMO_SANDBOX_EMAIL = "test@emotiongraph.local"


def seed_users_if_empty(session: Session) -> None:
    """Ensure Azin, Zahra, and Test exist (adds any missing users by email)."""
    for name, email in USER_SEED_SPECS:
        existing = session.query(User).filter(User.email == email).first()
        if existing is None:
            session.add(User(name=name, email=email))
    session.commit()
