plugins {
    id("com.android.application")
}

android {
    namespace = "com.che.jiaoyu"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.che.jiaoyu"
        minSdk = 24
        targetSdk = 34
        versionCode = 45
        versionName = "1.43"
    }

    signingConfigs {
        create("stable") {
            storeFile = file("jiaoyu.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("stable")
        }
        debug {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("stable")
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE.md",
                "META-INF/LICENSE.txt",
                "META-INF/NOTICE.md",
                "META-INF/NOTICE.txt",
                "META-INF/DEPENDENCIES"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.core:core:1.13.1")
    implementation("com.sun.mail:android-mail:1.6.7")
    implementation("com.sun.mail:android-activation:1.6.7")
}
