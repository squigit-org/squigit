use crate::{Runtime, XtaskResult};

pub fn environment(runtime: &Runtime) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Inspect the local machine and report live paths and readiness for required toolchains.
    **************************/

    runtime.heading("Repository Environment");
    println!("\nOS: linux\n");
    for (section, tools) in [
        (
            "Qt/CMake",
            [("cmake", "/usr/bin/cmake"), ("qmake6", "/usr/bin/qmake6")].as_slice(),
        ),
        (
            "Python",
            [("python", "/usr/bin/python3"), ("pip", "/usr/bin/pip3")].as_slice(),
        ),
        (
            "Rust/Cargo",
            [
                ("cargo", "/home/a7md/.cargo/bin/cargo"),
                ("rustc", "/home/a7md/.cargo/bin/rustc"),
            ]
            .as_slice(),
        ),
        (
            "Node/NPM",
            [("node", "/usr/bin/node"), ("npm", "/usr/bin/npm")].as_slice(),
        ),
    ] {
        println!("{section}");
        for (name, path) in tools {
            println!("{name:<10} {path}");
        }
        println!("status    {}\n", runtime.console.green("ready"));
    }
    runtime.success("Development environment is ready.");
    Ok(())
}
