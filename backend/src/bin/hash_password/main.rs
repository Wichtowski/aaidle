use std::io::{self, Read};

const INVALID_PASSWORD: &str = "Password must be between 12 and 128 characters.";

fn validated_password(input: &str) -> Result<&str, &'static str> {
    let password = input.trim_end_matches(['\r', '\n']);
    if !(12..=128).contains(&password.chars().count()) {
        return Err(INVALID_PASSWORD);
    }
    Ok(password)
}

fn password_hash(input: &str) -> Result<String, &'static str> {
    let password = validated_password(input)?;
    Ok(aidle_api::auth::hash_password(password).expect("could not hash password"))
}

fn write_password_hash(
    input: &str,
    output: &mut impl io::Write,
    error: &mut impl io::Write,
) -> bool {
    match password_hash(input) {
        Ok(password_hash) => {
            writeln!(output, "{password_hash}").expect("failed printing to stdout");
            true
        }
        Err(message) => {
            writeln!(error, "{message}").expect("failed printing to stderr");
            false
        }
    }
}

fn exit_status(success: bool) -> u8 {
    u8::from(!success)
}

fn main() -> std::process::ExitCode {
    let mut password = String::new();
    io::stdin()
        .read_to_string(&mut password)
        .expect("could not read password");

    std::process::ExitCode::from(exit_status(write_password_hash(
        &password,
        &mut io::stdout(),
        &mut io::stderr(),
    )))
}

#[cfg(test)]
mod tests;
