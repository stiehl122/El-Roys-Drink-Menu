#!/usr/bin/env ruby
# frozen_string_literal: true

require 'fileutils'
require 'pathname'
require 'xcodeproj'

ROOT = Pathname.new(__dir__).join('..').expand_path
PROJECT_PATH = ROOT.join('ElRoysManagerApp.xcodeproj')
APP_DIR = ROOT.join('ElRoysManagerApp')
TEST_DIR = ROOT.join('ElRoysManagerAppTests')
UI_TEST_DIR = ROOT.join('ElRoysManagerAppUITests')

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
      resource_target.resources_build_phase.add_file_reference(file_ref, true)
    end
  end
end

add_tree(app_group, APP_DIR.to_s, app_target)
add_tree(tests_group, TEST_DIR.to_s, tests_target)
add_tree(ui_tests_group, UI_TEST_DIR.to_s, ui_tests_target)

project.add_build_configuration('Preview', :debug)
[app_target, tests_target, ui_tests_target].each { |target| target.add_build_configuration('Preview', :debug) }

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

set_common_settings(project.build_configurations, bundle_id: 'com.stiehl122.elroys.manager.project', product_name: 'ElRoysManagerApp')
set_common_settings(app_target.build_configurations, bundle_id: 'com.stiehl122.elroys.manager', product_name: 'ElRoysManagerApp')
set_common_settings(tests_target.build_configurations, bundle_id: 'com.stiehl122.elroys.manager.tests', product_name: 'ElRoysManagerAppTests')
set_common_settings(ui_tests_target.build_configurations, bundle_id: 'com.stiehl122.elroys.manager.uitests', product_name: 'ElRoysManagerAppUITests')

app_target.build_configurations.each do |config|
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
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['DEVELOPMENT_TEAM'] = ''
  settings['APPEnvironmentName'] = config.name == 'Release' ? 'Production' : 'Preview'
  settings['APPBaseURL'] = 'https://el-roys-drink-menu.vercel.app'
  settings['APPPublicOrigin'] = 'https://el-roys-drink-menu.vercel.app'
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
scheme.save_as(PROJECT_PATH.to_s, 'ElRoysManagerApp', true)

project.save
