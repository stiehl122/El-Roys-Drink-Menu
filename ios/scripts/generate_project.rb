#!/usr/bin/env ruby
# frozen_string_literal: true

require 'fileutils'
require 'pathname'
require 'xcodeproj'

module DeterministicXcodeUUIDs
  def generate_uuid
    @deterministic_uuid_counter ||= 0

    loop do
      @deterministic_uuid_counter += 1
      uuid = format('%024X', @deterministic_uuid_counter)
      next if uuids.include?(uuid)

      @generated_uuids << uuid if defined?(@generated_uuids) && @generated_uuids
      return uuid
    end
  end
end

Xcodeproj::Project.prepend(DeterministicXcodeUUIDs)

ROOT = Pathname.new(__dir__).join('..').expand_path
PROJECT_PATH = ROOT.join('ElRoysManagerApp.xcodeproj')
APP_DIR = ROOT.join('ElRoysManagerApp')
TEST_DIR = ROOT.join('ElRoysManagerAppTests')
UI_TEST_DIR = ROOT.join('ElRoysManagerAppUITests')
INFO_PLIST_PATH = APP_DIR.join('Info.plist')

INFO_PLIST_CONTENT = <<~PLIST
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>APPBaseURL</key>
    <string>$(APPBaseURL)</string>
    <key>APPEnvironmentName</key>
    <string>$(APPEnvironmentName)</string>
    <key>APPPublicOrigin</key>
    <string>$(APPPublicOrigin)</string>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>El Roy's Manager</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>ITSAppUsesNonExemptEncryption</key>
    <false/>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>NSCameraUsageDescription</key>
    <string>Scan drink and food item barcodes to prefill add-item fields.</string>
    <key>NSFaceIDUsageDescription</key>
    <string>Unlock the saved staff session before restoring manager access.</string>
    <key>UIApplicationSceneManifest</key>
    <dict>
      <key>UIApplicationSupportsMultipleScenes</key>
      <true/>
      <key>UISceneConfigurations</key>
      <dict/>
    </dict>
    <key>UIApplicationSupportsIndirectInputEvents</key>
    <true/>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
      <string>UIInterfaceOrientationPortrait</string>
      <string>UIInterfaceOrientationPortraitUpsideDown</string>
      <string>UIInterfaceOrientationLandscapeLeft</string>
      <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
      <string>UIInterfaceOrientationPortrait</string>
      <string>UIInterfaceOrientationPortraitUpsideDown</string>
      <string>UIInterfaceOrientationLandscapeLeft</string>
      <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
  </dict>
  </plist>
PLIST

File.write(INFO_PLIST_PATH, INFO_PLIST_CONTENT)

FileUtils.rm_rf(PROJECT_PATH)
FileUtils.rm_rf(ROOT.join('xcshareddata'))

project = Xcodeproj::Project.new(PROJECT_PATH.to_s)
project.root_object.attributes['LastUpgradeCheck'] = '2630'
project.root_object.attributes['TargetAttributes'] = {}

main_group = project.main_group
products_group = main_group.find_subpath('Products', true)

app_group = main_group.new_group('ElRoysManagerApp', APP_DIR.relative_path_from(PROJECT_PATH.parent).to_s)
tests_group = main_group.new_group('ElRoysManagerAppTests', TEST_DIR.relative_path_from(PROJECT_PATH.parent).to_s)
ui_tests_group = main_group.new_group('ElRoysManagerAppUITests', UI_TEST_DIR.relative_path_from(PROJECT_PATH.parent).to_s)

app_target = project.new_target(:application, 'ElRoysManagerApp', :ios, '18.0')
tests_target = project.new_target(:unit_test_bundle, 'ElRoysManagerAppTests', :ios, '18.0')
ui_tests_target = project.new_target(:ui_test_bundle, 'ElRoysManagerAppUITests', :ios, '18.0')

tests_target.add_dependency(app_target)
ui_tests_target.add_dependency(app_target)

project.root_object.attributes['TargetAttributes'][app_target.uuid] = {
  'CreatedOnToolsVersion' => '26.3',
}
project.root_object.attributes['TargetAttributes'][tests_target.uuid] = {
  'CreatedOnToolsVersion' => '26.3',
  'TestTargetID' => app_target.uuid,
}
project.root_object.attributes['TargetAttributes'][ui_tests_target.uuid] = {
  'CreatedOnToolsVersion' => '26.3',
  'TestTargetID' => app_target.uuid,
}

def add_tree(group, directory, target, resource_target: target)
  Dir.children(directory).sort.each do |entry|
    next if entry.start_with?('.')

    full_path = File.join(directory, entry)
    ext = File.extname(entry)

    if ext == '.xcassets'
      file_ref = group.new_file(entry)
      resource_target.resources_build_phase.add_file_reference(file_ref, true)
      next
    end

    if File.directory?(full_path)
      subgroup = group.new_group(entry, entry)
      add_tree(subgroup, full_path, target, resource_target: resource_target)
      next
    end

    file_ref = group.new_file(entry)
    case ext
    when '.swift'
      target.source_build_phase.add_file_reference(file_ref, true)
    when '.xcassets', '.plist', '.strings'
      next if entry == 'Info.plist'

      resource_target.resources_build_phase.add_file_reference(file_ref, true)
    end
  end
end

add_tree(app_group, APP_DIR.to_s, app_target)
add_tree(tests_group, TEST_DIR.to_s, tests_target)
add_tree(ui_tests_group, UI_TEST_DIR.to_s, ui_tests_target)

def ensure_debug_release_configurations!(configurable)
  names = configurable.build_configurations.map(&:name).sort
  return if names == %w[Debug Release]

  raise "#{configurable.display_name} must have exactly Debug and Release configurations, found #{names.join(', ')}"
end

def set_common_settings(configs, bundle_id:, product_name:)
  configs.each do |config|
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id
    config.build_settings['PRODUCT_NAME'] = product_name
    config.build_settings['SWIFT_VERSION'] = '5.0'
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '18.0'
    config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
    config.build_settings.delete('SDKROOT')
    config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
    config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
    config.build_settings['MARKETING_VERSION'] = '0.1.0'
  end
end

def apply_app_build_settings(config, bundle_id)
  settings = config.build_settings
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id
  settings['CURRENT_PROJECT_VERSION'] = '1'
  settings['MARKETING_VERSION'] = '0.1.0'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '18.0'
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['INFOPLIST_FILE'] = 'ElRoysManagerApp/Info.plist'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['DEVELOPMENT_TEAM'] = ENV.fetch('APPLE_DEVELOPMENT_TEAM', 'FCM3AK447F')
  settings['APPBaseURL'] = ENV.fetch('ELROYS_IOS_APP_BASE_URL', 'https://el-roys-drink-menu.vercel.app')
  settings['APPPublicOrigin'] = ENV.fetch('ELROYS_IOS_PUBLIC_ORIGIN', 'https://el-roys-drink-menu.vercel.app')
  settings['APPEnvironmentName'] = config.name == 'Release' ? 'Production' : 'Preview'
  settings['INFOPLIST_KEY_APPBaseURL'] = settings['APPBaseURL']
  settings['INFOPLIST_KEY_APPPublicOrigin'] = settings['APPPublicOrigin']
  settings['INFOPLIST_KEY_APPEnvironmentName'] = settings['APPEnvironmentName']
end

ensure_debug_release_configurations!(project)
[app_target, tests_target, ui_tests_target].each { |target| ensure_debug_release_configurations!(target) }

set_common_settings(project.build_configurations, bundle_id: 'com.stiehl122.elroys.manager.project', product_name: 'ElRoysManagerApp')
set_common_settings(app_target.build_configurations, bundle_id: 'com.stiehl122.elroys.manager', product_name: 'ElRoysManagerApp')
set_common_settings(tests_target.build_configurations, bundle_id: 'com.stiehl122.elroys.manager.tests', product_name: 'ElRoysManagerAppTests')
set_common_settings(ui_tests_target.build_configurations, bundle_id: 'com.stiehl122.elroys.manager.uitests', product_name: 'ElRoysManagerAppUITests')

app_target.build_configurations.each do |config|
  apply_app_build_settings(config, 'com.stiehl122.elroys.manager')

  settings = config.build_settings
  settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
  settings['INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents'] = 'YES'
  settings['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  settings['INFOPLIST_KEY_UISupportedInterfaceOrientations'] = 'UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'
  settings['INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad'] = 'UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'
  settings['INFOPLIST_KEY_NSCameraUsageDescription'] = 'Scan drink and food item barcodes to prefill add-item fields.'
  settings['INFOPLIST_KEY_NSFaceIDUsageDescription'] = 'Unlock the saved staff session before restoring manager access.'
  settings['INFOPLIST_KEY_CFBundleDisplayName'] = "El Roy's Manager"
  settings['INFOPLIST_KEY_ITSAppUsesNonExemptEncryption'] = 'NO'
end

tests_target.build_configurations.each do |config|
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  config.build_settings['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/ElRoysManagerApp.app/ElRoysManagerApp"
end

ui_tests_target.build_configurations.each do |config|
  config.build_settings['TEST_TARGET_NAME'] = 'ElRoysManagerApp'
end

scheme = Xcodeproj::XCScheme.new
scheme.set_launch_target(app_target)
scheme.add_build_target(app_target)
scheme.add_test_target(tests_target)
scheme.add_test_target(ui_tests_target)
scheme.doc.root.attributes['LastUpgradeVersion'] = '2640'
scheme.test_action.build_configuration = 'Debug'
scheme.launch_action.build_configuration = 'Debug'
scheme.analyze_action.build_configuration = 'Debug'
scheme.profile_action.build_configuration = 'Release'
scheme.archive_action.build_configuration = 'Release'
scheme.save_as(PROJECT_PATH.to_s, 'ElRoysManagerApp', true)

project.save
