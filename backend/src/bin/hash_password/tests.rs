use super::*;

struct FailingWriter;

impl io::Write for FailingWriter {
    fn write(&mut self, _buffer: &[u8]) -> io::Result<usize> {
        Err(io::Error::other("write failed"))
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn accepts_inclusive_character_count_boundaries() {
    assert_eq!(validated_password("abcdefghijkl\n"), Ok("abcdefghijkl"));
    let maximum = "a".repeat(128);
    assert_eq!(validated_password(&maximum), Ok(maximum.as_str()));
}

#[test]
fn rejects_passwords_outside_character_count_boundaries() {
    assert_eq!(validated_password("abcdefghijk"), Err(INVALID_PASSWORD));
    assert_eq!(validated_password(&"a".repeat(129)), Err(INVALID_PASSWORD));
}

#[test]
fn counts_unicode_characters_and_only_trims_line_endings() {
    let unicode = "é".repeat(12);
    assert_eq!(
        validated_password(&format!("{unicode}\r\n")),
        Ok(unicode.as_str())
    );
    assert_eq!(validated_password("abcdefghijkl  \n"), Ok("abcdefghijkl  "));
}

#[test]
fn hashes_validated_input_and_propagates_validation_errors() {
    let hash = password_hash("correct horse battery staple\r\n").expect("password hash");
    assert!(
        aidle_api::auth::verify_password("correct horse battery staple", &hash)
            .expect("password verification")
    );
    assert_eq!(password_hash("short"), Err(INVALID_PASSWORD));
}

#[test]
fn writes_success_and_validation_workflows_to_separate_streams() {
    let mut output = Vec::new();
    let mut error = Vec::new();
    assert!(write_password_hash(
        "correct horse battery staple\n",
        &mut output,
        &mut error
    ));
    assert!(error.is_empty());
    let encoded = String::from_utf8(output).expect("UTF-8 hash output");
    assert!(
        aidle_api::auth::verify_password("correct horse battery staple", encoded.trim_end())
            .expect("password verification")
    );

    let mut output = Vec::new();
    let mut error = Vec::new();
    assert!(!write_password_hash("short", &mut output, &mut error));
    assert!(output.is_empty());
    assert_eq!(
        String::from_utf8(error).expect("UTF-8 error"),
        format!("{INVALID_PASSWORD}\n")
    );
}

#[test]
fn exit_status_reflects_the_hashing_decision() {
    assert_eq!(exit_status(true), 0);
    assert_eq!(exit_status(false), 1);
}

#[test]
fn output_failures_preserve_print_macro_panics() {
    io::Write::flush(&mut FailingWriter).expect("flush remains successful");

    let output_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        write_password_hash(
            "correct horse battery staple",
            &mut FailingWriter,
            &mut Vec::new(),
        )
    }));
    assert!(output_panic.is_err());

    let error_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        write_password_hash("short", &mut Vec::new(), &mut FailingWriter)
    }));
    assert!(error_panic.is_err());
}
