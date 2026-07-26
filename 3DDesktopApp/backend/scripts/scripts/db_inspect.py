import sqlite3


def main() -> None:
    con = sqlite3.connect("history.db")
    cur = con.cursor()
    cur.execute("select name from sqlite_master where type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print("tables:", tables)

    def table_info(lower_name: str) -> tuple[str, list[str]] | None:
        cur.execute("select name from sqlite_master where type='table' and lower(name)=?", (lower_name,))
        row = cur.fetchone()
        if not row:
            return None
        name = row[0]
        cur.execute(f"PRAGMA table_info('{name}')")
        cols = [r[1] for r in cur.fetchall()]
        return name, cols

    for t in ["chatsession", "sceneobjectrecord", "scenehistory"]:
        info = table_info(t)
        if info:
            name, cols = info
            print(f"{name} cols:", cols)

    obj_table = table_info("sceneobjectrecord")
    if obj_table:
        name, _ = obj_table
        cur.execute(f"select object_id, session_id, object_name, status, created_at from '{name}' order by created_at desc limit 20")
        print("latest objects:")
        for r in cur.fetchall():
            print(r)

    chat_table = table_info("chatsession")
    if chat_table:
        name, _ = chat_table
        cur.execute(f"select session_id, user_id, title, created_at, updated_at from '{name}' order by updated_at desc limit 20")
        print("latest sessions:")
        for r in cur.fetchall():
            print(r)

    con.close()


if __name__ == "__main__":
    main()
