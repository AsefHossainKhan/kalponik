fn main() {
    // Kalponik patch: upstream used `cfg!(target_os = "windows")`, which in a
    // build script is the *host* OS, so cross-compiling for Android from a
    // Windows machine tried to link advapi32. Check the *target* OS instead.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
