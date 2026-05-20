use crate::utils::process::run_cmd;
use anyhow::Result;
use std::path::Path;

pub fn is_git_repo() -> bool {
    Path::new(".git").exists()
}

pub struct BranchStatus {
    pub up_to_date: bool,
    pub reason: String,
}

pub fn is_branch_up_to_date() -> BranchStatus {
    match check_branch_up_to_date() {
        Ok(status) => status,
        Err(_) => BranchStatus {
            up_to_date: false,
            reason: "Failed to determine git branch status.".to_string(),
        },
    }
}

fn check_branch_up_to_date() -> Result<BranchStatus> {
    run_cmd("git", &["fetch"])?;
    let output = run_cmd("git", &["status", "-uno"])?;
    let status_text = output.stdout.trim();

    if status_text.contains("Your branch is behind") {
        return Ok(BranchStatus {
            up_to_date: false,
            reason: "Your branch is behind the remote. Pull the latest changes first.".to_string(),
        });
    }

    if status_text.contains("have diverged") {
        return Ok(BranchStatus {
            up_to_date: false,
            reason: "Your branch has diverged from the remote. Resolve this before updating."
                .to_string(),
        });
    }

    Ok(BranchStatus {
        up_to_date: true,
        reason: String::new(),
    })
}
