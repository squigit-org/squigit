// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_auth::verify_artifact_signature;
use std::env;

fn main() {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let [artifact, signature] = args.as_slice() else {
        eprintln!(
            "usage: cargo run -p squigit-auth --example verify_artifact -- <artifact.zip> <artifact.sig>"
        );
        std::process::exit(2);
    };

    match verify_artifact_signature(artifact, signature) {
        Ok(true) => println!("authentic"),
        Ok(false) => {
            eprintln!("invalid signature");
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("verification failed: {error}");
            std::process::exit(2);
        }
    }
}
