// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(xtask::run(&args));
}
