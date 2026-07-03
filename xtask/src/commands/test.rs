use crate::components::TestSelection;
use crate::registry::manifest::Operation;
use crate::registry::{Component, Registry};
use crate::{components, Runtime};
use std::collections::HashSet;
use std::path::PathBuf;

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if !args.is_empty() {
            return super::fail(
                runtime,
                "repository test does not accept numbered selectors.",
            );
        }
        return run_repository(runtime, registry);
    }

    let component = match super::component_operation(runtime, registry, Operation::Test) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let tests = mock_tests(component);
    if tests.is_empty() && !args.is_empty() {
        return super::fail(runtime, "No tests are available for numbered selection.");
    }
    let selection = match select_tests(&tests, args) {
        Ok(selection) => selection,
        Err(error) => return super::fail(runtime, &error),
    };
    print_test_panel(runtime, component, &tests, &selection);
    match components::test(runtime, component, &selection) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

fn run_repository(runtime: &Runtime, registry: &Registry) -> i32 {
    let mut succeeded = 0;
    let mut failed = 0;
    let mut found_any = false;
    for component in registry.targets_for(Operation::Test) {
        let tests = mock_tests(component);
        if tests.is_empty() {
            continue;
        }
        found_any = true;
        let selection = TestSelection {
            paths: tests,
            label: String::new(),
        };
        match components::test(runtime, component, &selection) {
            Ok(()) => succeeded += 1,
            Err(error) => {
                failed += 1;
                runtime.error(&format!("{}: {error}", component.name()));
            }
        }
    }
    if !found_any && failed == 0 {
        runtime.note("Nothing here yet.");
    }
    super::print_summary("Test", succeeded, failed);
    i32::from(failed > 0)
}

fn select_tests(tests: &[PathBuf], args: &[String]) -> Result<TestSelection, String> {
    if args.is_empty() {
        return Ok(TestSelection {
            paths: tests.to_vec(),
            label: String::new(),
        });
    }
    let (skip, values) = if args.first().is_some_and(|value| value == "--skip") {
        if args.len() == 1 {
            return Err("--skip requires at least one test number.".to_string());
        }
        (true, &args[1..])
    } else {
        if args.iter().any(|value| value.starts_with('-')) {
            return Err("test accepts only numbers or --skip followed by numbers.".to_string());
        }
        (false, args)
    };
    let numbers = parse_numbers(values, tests.len())?;
    let selected = if skip {
        tests
            .iter()
            .enumerate()
            .filter(|(index, _)| !numbers.contains(&(index + 1)))
            .map(|(_, path)| path.clone())
            .collect()
    } else {
        numbers
            .iter()
            .map(|number| tests[*number - 1].clone())
            .collect()
    };
    let joined = numbers
        .iter()
        .map(usize::to_string)
        .collect::<Vec<_>>()
        .join(", ");
    Ok(TestSelection {
        paths: selected,
        label: if skip {
            format!(" (skipping tests {joined})")
        } else {
            format!(" (tests {joined})")
        },
    })
}

fn parse_numbers(values: &[String], count: usize) -> Result<Vec<usize>, String> {
    let mut seen = HashSet::new();
    let mut numbers = Vec::new();
    for value in values {
        let number = value
            .parse::<usize>()
            .map_err(|_| format!("Test selector '{value}' is not a positive number."))?;
        if number == 0 {
            return Err("Test numbers start at 1.".to_string());
        }
        if number > count {
            return Err(format!(
                "Test number {number} is out of range; this component has {count} tests."
            ));
        }
        if !seen.insert(number) {
            return Err(format!("Test number {number} was supplied more than once."));
        }
        numbers.push(number);
    }
    Ok(numbers)
}

fn print_test_panel(
    runtime: &Runtime,
    component: &Component,
    tests: &[PathBuf],
    selection: &TestSelection,
) {
    runtime.heading(&format!("{} Test", component.display_name()));
    println!("\nTests found:");
    if tests.is_empty() {
        println!("  none");
    } else {
        for test in tests {
            println!("  {}", test.display());
        }
    }
    let running = if selection.label.is_empty() {
        "all".to_string()
    } else {
        selection.label.trim().to_string()
    };
    println!(
        "\nRunning:\n  {running:<20} {}",
        runtime.console.green("ready")
    );
}

fn mock_tests(component: &Component) -> Vec<PathBuf> {
    if component.name() == "cli" {
        ["live-brain.test.ts", "live-store.test.ts"]
            .into_iter()
            .map(PathBuf::from)
            .collect()
    } else {
        Vec::new()
    }
}
