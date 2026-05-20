use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Default)]
pub struct PackageJson {
    #[serde(default)]
    pub dependencies: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub dev_dependencies: std::collections::HashMap<String, String>,
}

pub fn read_project_package_json() -> Result<PackageJson> {
    let path = PathBuf::from("package.json");
    let content =
        fs::read_to_string(&path).with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&content).context("Failed to parse package.json")
}

pub fn is_package_installed(package_json: &PackageJson, package_name: &str) -> bool {
    package_json.dependencies.contains_key(package_name)
        || package_json.dev_dependencies.contains_key(package_name)
}

pub fn is_dev_dependency(package_json: &PackageJson, package_name: &str) -> bool {
    package_json.dev_dependencies.contains_key(package_name)
}

pub fn get_installed_version(package_name: &str) -> Option<String> {
    let path = PathBuf::from("node_modules")
        .join(package_name)
        .join("package.json");

    let content = fs::read_to_string(path).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&content).ok()?;
    pkg.get("version")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
}
