import sqlite3
import pandas as pd

conn = sqlite3.connect("hockey.db")

# seznam tabulek
tables = pd.read_sql(
    "SELECT name FROM sqlite_master WHERE type='table';", conn
)
print(tables)

# zobraz data z tabulky Game
df = pd.read_sql("SELECT * FROM game LIMIT 10;", conn)
print(df)

conn.close()