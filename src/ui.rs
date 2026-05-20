use console::style;

pub fn intro(title: &str) {
    println!();
    println!("{}", style(title).black().on_white().bold());
}

pub fn outro(message: &str) {
    println!("{}", style(message).dim());
}

pub fn log_success(message: &str) {
    println!("{} {}", style("✓").green(), message);
}

pub fn log_info(message: &str) {
    println!("{} {}", style("○").cyan(), message);
}

pub fn log_warn(message: &str) {
    println!("{} {}", style("!").yellow(), message);
}

pub fn log_error(message: &str) {
    eprintln!("{} {}", style("✗").red(), message);
}

pub fn log_step(message: &str) {
    println!("{} {}", style("→").dim(), message);
}
