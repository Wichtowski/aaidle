use std::io::{self, Read};

fn main() {
    let mut password = String::new();
    io::stdin()
        .read_to_string(&mut password)
        .expect("could not read password");

    let password = password.trim_end_matches(['\r', '\n']);
    if password.chars().count() < 12 || password.chars().count() > 128 {
        eprintln!("Password must be between 12 and 128 characters.");
        std::process::exit(1);
    }

    println!(
        "{}",
        aidle_api::auth::hash_password(password).expect("could not hash password")
    );
}
