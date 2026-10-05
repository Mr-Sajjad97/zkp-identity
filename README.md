# 🛡️ Zero-Knowledge Offline Identity Verifier (Mobile)

> **Privacy-Preserving Identity Verification on Android using Plonky2 & Rust**

![Status](https://img.shields.io/badge/Status-Complete-success)
![Tech](https://img.shields.io/badge/Built%20With-Rust%20%7C%20Kotlin%20%7C%20Plonky2-orange)
![Performance](https://img.shields.io/badge/Verification-~19ms-brightgreen)

## 📖 Overview

**Zero-Knowledge Offline Identity Verifier** is a Final Year Project (FYP) that demonstrates privacy-preserving digital identity verification on Android.

The application is designed to verify **Zero-Knowledge Proofs (ZKPs) locally on the device**, without requiring an internet connection during the verification process.

The project combines:

* **Rust** for the cryptographic verification engine
* **Plonky2** for Zero-Knowledge Proof verification
* **JNI** for communication between Rust and Android
* **Kotlin** for the Android application
* **ZXing** for QR-code based data transfer

The main objective is to demonstrate that privacy-preserving identity verification can be performed locally on mobile hardware.

---

## 🚀 Key Features

* ⚡ **Fast Verification** — Local proof verification with a measured target of approximately 19 ms under the tested configuration.
* 🔒 **Offline Verification** — Verification can be performed without an internet connection.
* 📱 **Android Application** — Designed to run directly on Android devices.
* 🦀 **Rust Native Engine** — Cryptographic operations are implemented in Rust.
* 🔗 **JNI Integration** — Connects the Rust verification engine with the Android application.
* 📷 **QR-Based Data Transfer** — Uses QR codes to transfer proof data between devices.
* 🛡️ **Tamper Detection** — Invalid or modified proof data is rejected by the verification process.
* 💾 **Low Resource Usage** — The project is designed with mobile resource constraints in mind.

---

## 📊 Performance Benchmarks

The following measurements were obtained during internal testing of the project.

| Metric            | Project Result |  Reference Implementation |
| ----------------- | -------------: | ------------------------: |
| Verification Time |   **~19.2 ms** |                   ~450 ms |
| RAM Usage         |     **~14 MB** |                   ~150 MB |
| Verification Mode |    **Offline** | Depends on implementation |
| Proof System      |    **Plonky2** |                   Groth16 |

> **Note:** Performance depends on the Android device, processor, operating system, proof configuration, compiler settings, and benchmark methodology. The values above should be treated as measurements from the tested configuration rather than universal performance guarantees.

### Test Environment

* Android device
* Snapdragon 6-series equivalent hardware
* Internal repeated-verification benchmark
* 100 verification iterations

---

## 🛠️ Technology Stack

### Core

* **Rust**
* **Plonky2**

### Android

* **Kotlin**
* **Android SDK**
* **ZXing**

### Native Integration

* **JNI (Java Native Interface)**
* **Cargo NDK**

### Data Transfer

* **QR Code**
* QR streaming for transferring verification data

---

## 📂 Project Structure

A typical project structure is:

```text
zkp-identity/
│
├── app/
│   └── src/
│
├── rust_core/
│   ├── src/
│   ├── Cargo.toml
│   └── build_android.sh
│
├── screenshots/
│   ├── verified.jpg
│   └── fake_proof.jpg
│
├── Cargo.toml
├── LICENSE
├── README.md
└── ...
```

The exact structure may vary depending on the project configuration.

---

## 📸 Screenshots & Demo

### Identity Verified

![Identity Verified](screenshots/verified.jpg)

**Verification time:** ~19 ms under the tested configuration.

### Fake Proof Detection

![Fake Proof Detected](screenshots/fake_proof.jpg)

The application rejects modified or invalid proof data during verification.

---

## 📦 Requirements

Before building the project, install the following:

1. **Android Studio**
2. **Android SDK**
3. **Android NDK**
4. **Rust**
5. **Cargo**
6. **cargo-ndk**

Install `cargo-ndk` using:

```bash
cargo install cargo-ndk
```

---

## 🔨 Build Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/Mr-Sajjad97/zkp-identity.git
cd zkp-identity
```

### 2. Build the Rust Native Library

Go to the Rust project:

```bash
cd rust_core
```

Run the Android build script:

```bash
./build_android.sh
```

> On Windows, the build command may need to be executed through Git Bash, WSL, or an equivalent shell depending on the script configuration.

### 3. Open the Android Project

Open the project in **Android Studio**.

Allow Android Studio to synchronize Gradle dependencies.

### 4. Connect an Android Device

Enable **Developer Options** and **USB Debugging** on the Android device.

Then select the device in Android Studio.

### 5. Build and Run

Click:

**Run ▶**

Android Studio will compile the application and install it on the connected device.

---

## 🔐 Security Considerations

This project is an academic/prototype implementation intended for demonstrating privacy-preserving identity verification.

It should not be considered a production identity-management system without additional security review and testing.

For production deployment, additional considerations would include:

* Secure key management
* Secure storage
* Cryptographic parameter validation
* Input validation
* Replay protection
* QR data integrity
* Device compromise detection
* Formal security analysis
* Independent cryptographic audit

---

## 🌐 Offline Operation

The verification process is designed to work locally on the Android device.

The QR-based transfer mechanism allows proof data to be transferred without requiring:

* Internet
* Bluetooth
* NFC

An internet connection may still be required for development activities such as downloading dependencies, Gradle packages, Rust crates, or Android SDK components.

---

## 🧪 Testing

The project should be tested using:

* Valid proof data
* Invalid proof data
* Modified proof data
* Corrupted QR data
* Repeated verification
* Different Android devices
* Different processor configurations

Example benchmark:

```text
Verification iterations: 100
Measured verification time: ~19.2 ms
```

Actual performance may vary between devices.

---

## 🤝 Contributing

Contributions, suggestions, and improvements are welcome.

To contribute:

```bash
git fork https://github.com/Mr-Sajjad97/zkp-identity.git
```

Create a feature branch:

```bash
git checkout -b feature/my-feature
```

Commit your changes:

```bash
git add .
git commit -m "Improve verification module"
```

Push the branch:

```bash
git push origin feature/my-feature
```

Then open a Pull Request on GitHub.

---

## 📜 License

This project is intended to be released under the **MIT License**.

Make sure the repository contains a `LICENSE` file with the complete MIT License text.

---

## 👨‍💻 Project

**Zero-Knowledge Offline Identity Verifier**

Built with:

**Rust + Plonky2 + Kotlin + JNI + ZXing**

GitHub:

https://github.com/Mr-Sajjad97/zkp-identity

## 📜 License
This project is open-source under the MIT License.
