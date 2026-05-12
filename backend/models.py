from sqlalchemy import Column, Integer, String, Float, Date, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class Season(Base):
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)   # "25/26"
    league = Column(String, nullable=False)              # "ELH"
    games_rs = Column(Integer)                           # počet zápasů v základní části
    rs_start = Column(Date)
    rs_end = Column(Date)

    games = relationship("Game", back_populates="season")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)   # "SPA", "TRI" ...
    name = Column(String)                                # "Sparta Praha"
    city = Column(String)
    league = Column(String)
    since = Column(Integer)

    home_games = relationship("Game", foreign_keys="Game.home_team_id", back_populates="home_team")
    away_games = relationship("Game", foreign_keys="Game.away_team_id", back_populates="away_team")
    goalies = relationship("Goalie", back_populates="team")
    pp_pk_stats = relationship("GamePPPK", back_populates="team")
    context_notes = relationship("ContextNote", back_populates="team")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    date = Column(Date, nullable=False)
    round = Column(Integer)                              # Kolo/Zapas
    game_type = Column(String, default="RS")            # RS / PO (playoff)

    goals_home = Column(Integer)
    goals_away = Column(Integer)
    shots_home = Column(Integer)
    shots_away = Column(Integer)
    xg_home = Column(Float)
    xg_away = Column(Float)

    ot_so = Column(Integer, default=0)                  # 0=regular, 1=OT, 2=SO
    result_home = Column(String)                        # W / L / OTW / OTL

    season = relationship("Season", back_populates="games")
    home_team = relationship("Team", foreign_keys=[home_team_id], back_populates="home_games")
    away_team = relationship("Team", foreign_keys=[away_team_id], back_populates="away_games")
    pp_pk_stats = relationship("GamePPPK", back_populates="game")
    goalie_stats = relationship("GoalieGameStat", back_populates="game")

    __table_args__ = (
        UniqueConstraint("date", "home_team_id", "away_team_id", name="uq_game"),
    )


class GamePPPK(Base):
    __tablename__ = "game_pp_pk"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)

    pp_opportunities = Column(Integer, default=0)       # PP_O
    pp_goals = Column(Integer, default=0)               # PP_G
    pk_opportunities = Column(Integer, default=0)       # PK_O
    pk_goals_against = Column(Integer, default=0)       # PK_GA

    game = relationship("Game", back_populates="pp_pk_stats")
    team = relationship("Team", back_populates="pp_pk_stats")


class Goalie(Base):
    __tablename__ = "goalies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"))

    team = relationship("Team", back_populates="goalies")
    game_stats = relationship("GoalieGameStat", back_populates="goalie")


class GoalieGameStat(Base):
    __tablename__ = "goalie_game_stats"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    goalie_id = Column(Integer, ForeignKey("goalies.id"), nullable=False)

    minutes = Column(Float)
    shots_against = Column(Integer)
    saves = Column(Integer)
    goals_against = Column(Integer)

    game = relationship("Game", back_populates="goalie_stats")
    goalie = relationship("Goalie", back_populates="game_stats")


class ModelParameter(Base):
    __tablename__ = "model_parameters"

    id = Column(Integer, primary_key=True, index=True)
    season_code = Column(String)                        # "25/26" nebo "all"
    game_type = Column(String, default="RS")            # RS / PO
    parameter = Column(String, nullable=False)          # "Intercept", "Home", "xG_Diff" ...
    coefficient = Column(Float, nullable=False)
    source = Column(String)                             # "Minitab", "Manual"
    note = Column(String)

    __table_args__ = (
        UniqueConstraint("season_code", "game_type", "parameter", name="uq_param"),
    )


class ContextNote(Base):
    __tablename__ = "context_notes"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"))
    date = Column(Date)
    type = Column(String)                               # "injury", "suspension", "form" ...
    note = Column(Text)

    team = relationship("Team", back_populates="context_notes")