use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

use uuid::Uuid;

struct TestDatabase(PathBuf);

impl TestDatabase {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!("aidle-bin-test-{}.db", Uuid::new_v4())))
    }

    fn url(&self) -> String {
        format!("sqlite://{}", self.0.display())
    }
}

impl Drop for TestDatabase {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let path = format!("{}{}", self.0.display(), suffix);
            if fs::exists(&path).unwrap_or(false) {
                fs::remove_file(path).expect("remove test database");
            }
        }
    }
}

fn local_command(binary: &str, database: &TestDatabase) -> Command {
    let mut command = Command::new(binary);
    command
        .env("AIDLE_ENV", "local")
        .env_remove("NODE_ENV")
        .env("DATABASE_URL", database.url())
        .env("AIDLE_BIND_ADDR", "127.0.0.1:0")
        .env("REQUEST_TIMEOUT_SECONDS", "1")
        .env_remove("DAILY_SELECTION_SECRET")
        .env_remove("APP_ORIGIN")
        .env_remove("AUTH_SECRET")
        .env_remove("HEALTH_KEY")
        .env_remove("AAIDLE_VERSION")
        .env_remove("GITHUB_CLIENT_ID")
        .env_remove("GITHUB_CLIENT_SECRET")
        .env_remove("GOOGLE_CLIENT_ID")
        .env_remove("GOOGLE_CLIENT_SECRET")
        .env_remove("GITHUB_ISSUES_TOKEN")
        .env_remove("RESEND_API_KEY");
    command
}

fn hash_password(input: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_hash_password"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn password hasher");
    child
        .stdin
        .take()
        .expect("password stdin")
        .write_all(input.as_bytes())
        .expect("write password");
    child.wait_with_output().expect("password hasher output")
}

#[test]
fn password_hash_binary_reports_success_and_validation_failure() {
    let success = hash_password("correct horse battery staple\n");
    assert!(success.status.success());
    let encoded = String::from_utf8(success.stdout).expect("UTF-8 password hash");
    assert!(encoded.trim().starts_with("scrypt$"));
    assert!(success.stderr.is_empty());

    let failure = hash_password("short\n");
    assert_eq!(failure.status.code(), Some(1));
    assert!(failure.stdout.is_empty());
    assert!(
        String::from_utf8(failure.stderr)
            .expect("UTF-8 validation error")
            .contains("between 12 and 128 characters")
    );
}

#[test]
fn server_migration_seed_and_fixture_binaries_complete_real_workflows() {
    let server_database = TestDatabase::new();
    let server = local_command(env!("CARGO_BIN_EXE_aidle-api"), &server_database)
        .arg("--migrate-only")
        .output()
        .expect("run server migration");
    assert!(
        server.status.success(),
        "{}",
        String::from_utf8_lossy(&server.stderr)
    );
    assert!(server_database.0.exists());

    let seeded_database = TestDatabase::new();
    let seed = local_command(env!("CARGO_BIN_EXE_seed"), &seeded_database)
        .output()
        .expect("run seed binary");
    assert!(
        seed.status.success(),
        "{}",
        String::from_utf8_lossy(&seed.stderr)
    );

    let fixture = local_command(env!("CARGO_BIN_EXE_fixture_admin"), &seeded_database)
        .output()
        .expect("run fixture admin binary");
    assert!(
        fixture.status.success(),
        "{}",
        String::from_utf8_lossy(&fixture.stderr)
    );
}
