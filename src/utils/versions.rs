use crate::utils::process::run_cmd;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParsedVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

pub fn parse_version(version: &str) -> ParsedVersion {
    let cleaned = version.trim_start_matches(|c: char| !c.is_ascii_digit());
    let mut parts = cleaned.split('.');
    let major = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    ParsedVersion {
        major,
        minor,
        patch,
    }
}

fn fetch_published_versions(package_name: &str) -> Option<Vec<String>> {
    let output = run_cmd("npm", &["view", package_name, "versions", "--json"]).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&output.stdout).ok()?;

    match parsed {
        serde_json::Value::Array(arr) => Some(
            arr.into_iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect(),
        ),
        serde_json::Value::String(s) => Some(vec![s]),
        _ => None,
    }
}

pub fn get_next_minor_version(package_name: &str, current_version: &str) -> Option<String> {
    let current = parse_version(current_version);
    let target_minor = current.minor + 1;
    let versions = fetch_published_versions(package_name)?;

    let mut candidates: Vec<_> = versions
        .into_iter()
        .filter(|v| {
            let parsed = parse_version(v);
            parsed.major == current.major && parsed.minor == target_minor && !v.contains('-')
        })
        .collect();

    candidates.sort_by(|a, b| {
        let pa = parse_version(a);
        let pb = parse_version(b);
        pa.patch.cmp(&pb.patch)
    });

    candidates.pop()
}

pub fn get_next_patch_version(package_name: &str, current_version: &str) -> Option<String> {
    let current = parse_version(current_version);
    let versions = fetch_published_versions(package_name)?;

    let mut candidates: Vec<_> = versions
        .into_iter()
        .filter(|v| {
            let parsed = parse_version(v);
            parsed.major == current.major
                && parsed.minor == current.minor
                && parsed.patch > current.patch
                && !v.contains('-')
        })
        .collect();

    candidates.sort_by(|a, b| {
        let pa = parse_version(a);
        let pb = parse_version(b);
        pa.patch.cmp(&pb.patch)
    });

    candidates.pop()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_strips_prefix() {
        let v = parse_version("^18.2.0");
        assert_eq!(v.major, 18);
        assert_eq!(v.minor, 2);
        assert_eq!(v.patch, 0);
    }

    #[test]
    fn parse_version_handles_plain_semver() {
        let v = parse_version("1.2.3");
        assert_eq!(
            v,
            ParsedVersion {
                major: 1,
                minor: 2,
                patch: 3
            }
        );
    }

    #[test]
    fn next_minor_picks_highest_patch_in_target_minor() {
        let versions = vec![
            "1.0.0".to_string(),
            "1.1.0".to_string(),
            "1.1.1".to_string(),
            "1.1.2".to_string(),
            "1.2.0".to_string(),
        ];

        let current = parse_version("1.0.5");
        let target_minor = current.minor + 1;

        let mut candidates: Vec<_> = versions
            .into_iter()
            .filter(|v| {
                let parsed = parse_version(v);
                parsed.major == current.major && parsed.minor == target_minor && !v.contains('-')
            })
            .collect();
        candidates.sort_by(|a, b| parse_version(a).patch.cmp(&parse_version(b).patch));

        assert_eq!(candidates.last().map(String::as_str), Some("1.1.2"));
    }

    #[test]
    fn next_patch_excludes_prereleases() {
        let versions = vec![
            "2.0.0".to_string(),
            "2.0.1".to_string(),
            "2.0.2-beta.1".to_string(),
        ];
        let current = parse_version("2.0.0");

        let mut candidates: Vec<_> = versions
            .into_iter()
            .filter(|v| {
                let parsed = parse_version(v);
                parsed.major == current.major
                    && parsed.minor == current.minor
                    && parsed.patch > current.patch
                    && !v.contains('-')
            })
            .collect();
        candidates.sort_by(|a, b| parse_version(a).patch.cmp(&parse_version(b).patch));

        assert_eq!(candidates.last().map(String::as_str), Some("2.0.1"));
    }
}
