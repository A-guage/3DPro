#include "Commands/UnrealMCPProjectCommands.h"
#include "Commands/UnrealMCPCommonUtils.h"
#include "GameFramework/InputSettings.h"
#include "AssetToolsModule.h"
#include "AssetImportTask.h"
#include "Factories/FbxImportUI.h"
#include "Factories/FbxTextureImportData.h"
#include "Factories/FbxStaticMeshImportData.h"
#include "Factories/FbxFactory.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "HAL/PlatformFileManager.h"
#include "Modules/ModuleManager.h"
#include "Editor.h"
#include "EditorAssetLibrary.h"

FUnrealMCPProjectCommands::FUnrealMCPProjectCommands()
{
}

TSharedPtr<FJsonObject> FUnrealMCPProjectCommands::HandleCommand(const FString& CommandType, const TSharedPtr<FJsonObject>& Params)
{
    if (CommandType == TEXT("create_input_mapping"))
    {
        return HandleCreateInputMapping(Params);
    }
    else if (CommandType == TEXT("import_model"))
    {
        return HandleImportModel(Params);
    }

    return FUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Unknown project command: %s"), *CommandType));
}

TSharedPtr<FJsonObject> FUnrealMCPProjectCommands::HandleCreateInputMapping(const TSharedPtr<FJsonObject>& Params)
{
    FString ActionName;
    if (!Params->TryGetStringField(TEXT("action_name"), ActionName))
    {
        return FUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'action_name' parameter"));
    }

    FString Key;
    if (!Params->TryGetStringField(TEXT("key"), Key))
    {
        return FUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'key' parameter"));
    }

    UInputSettings* InputSettings = GetMutableDefault<UInputSettings>();
    if (!InputSettings)
    {
        return FUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Failed to get input settings"));
    }

    FInputActionKeyMapping ActionMapping;
    ActionMapping.ActionName = FName(*ActionName);
    ActionMapping.Key = FKey(*Key);

    if (Params->HasField(TEXT("shift")))
    {
        ActionMapping.bShift = Params->GetBoolField(TEXT("shift"));
    }
    if (Params->HasField(TEXT("ctrl")))
    {
        ActionMapping.bCtrl = Params->GetBoolField(TEXT("ctrl"));
    }
    if (Params->HasField(TEXT("alt")))
    {
        ActionMapping.bAlt = Params->GetBoolField(TEXT("alt"));
    }
    if (Params->HasField(TEXT("cmd")))
    {
        ActionMapping.bCmd = Params->GetBoolField(TEXT("cmd"));
    }

    InputSettings->AddActionMapping(ActionMapping);
    InputSettings->SaveConfig();

    TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
    ResultObj->SetStringField(TEXT("action_name"), ActionName);
    ResultObj->SetStringField(TEXT("key"), Key);
    return ResultObj;
}

TSharedPtr<FJsonObject> FUnrealMCPProjectCommands::HandleImportModel(const TSharedPtr<FJsonObject>& Params)
{
    UE_LOG(LogTemp, Log, TEXT("[Step 5] HandleImportModel called"));

    TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
    FString SourcePath;
    FString DestinationPath;

    try
    {
        if (!Params->TryGetStringField(TEXT("source_path"), SourcePath))
        {
            UE_LOG(LogTemp, Error, TEXT("[Step 5 ERROR] Missing 'source_path' parameter"));
            ResultObj->SetBoolField(TEXT("success"), false);
            ResultObj->SetStringField(TEXT("message"), TEXT("Missing 'source_path' parameter"));
            return ResultObj;
        }

        FString AssetName = FPaths::GetBaseFilename(SourcePath);
        Params->TryGetStringField(TEXT("asset_name"), AssetName);

        bool bHasCustomDestination = Params->TryGetStringField(TEXT("destination_path"), DestinationPath);
        if (!bHasCustomDestination || DestinationPath.IsEmpty())
        {
            DestinationPath = FString::Printf(TEXT("/Game/Imports/%s"), *AssetName);
        }

        UE_LOG(LogTemp, Log, TEXT("[Step 5a] source_path=%s, dest=%s, asset=%s"), *SourcePath, *DestinationPath, *AssetName);

        FPaths::NormalizeFilename(SourcePath);
        if (!FPaths::FileExists(SourcePath))
        {
            UE_LOG(LogTemp, Error, TEXT("[Step 5a ERROR] File not found: %s"), *SourcePath);
            ResultObj->SetBoolField(TEXT("success"), false);
            ResultObj->SetStringField(TEXT("message"), FString::Printf(TEXT("File not found: %s"), *SourcePath));
            return ResultObj;
        }

        FString Extension = FPaths::GetExtension(SourcePath).ToLower();
        if (Extension != TEXT("fbx"))
        {
            UE_LOG(LogTemp, Error, TEXT("[Step 5a ERROR] Unsupported format: %s. Only FBX is supported."), *Extension);
            ResultObj->SetBoolField(TEXT("success"), false);
            ResultObj->SetStringField(TEXT("message"), FString::Printf(TEXT("Unsupported format: %s. Only FBX is supported."), *Extension));
            return ResultObj;
        }

        if (!FPackageName::IsValidPath(DestinationPath))
        {
            UE_LOG(LogTemp, Error, TEXT("[Step 5a ERROR] Invalid destination: %s"), *DestinationPath);
            ResultObj->SetBoolField(TEXT("success"), false);
            ResultObj->SetStringField(TEXT("message"), FString::Printf(TEXT("Invalid destination: %s"), *DestinationPath));
            return ResultObj;
        }

        if (!UEditorAssetLibrary::DoesDirectoryExist(DestinationPath))
        {
            UEditorAssetLibrary::MakeDirectory(DestinationPath);
        }

        int64 FileSize = IFileManager::Get().FileSize(*SourcePath);
        UE_LOG(LogTemp, Log, TEXT("[Step 5b] Starting UAssetImportTask import... (file size: %.2f KB)"), FileSize / 1024.0);

        IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();

        UAssetImportTask* ImportTask = NewObject<UAssetImportTask>();
        ImportTask->Filename = SourcePath;
        ImportTask->DestinationPath = DestinationPath;
        ImportTask->bReplaceExisting = true;
        ImportTask->bAutomated = true;
        ImportTask->bSave = false; // Don't auto-save during import to avoid crash on ticker

        // Force legacy FBX Factory to bypass Interchange framework and respect UFbxImportUI settings
        ImportTask->Factory = NewObject<UFbxFactory>();

        UFbxImportUI* ImportUI = NewObject<UFbxImportUI>();
        ImportUI->MeshTypeToImport = FBXIT_StaticMesh;
        ImportUI->bImportMaterials = true;
        ImportUI->bImportTextures = true;
        ImportUI->bImportAnimations = false;
        
        // Create TextureImportData if it doesn't exist
        if (!ImportUI->TextureImportData)
        {
            ImportUI->TextureImportData = NewObject<UFbxTextureImportData>(ImportUI);
        }
        ImportUI->TextureImportData->MaterialSearchLocation = EMaterialSearchLocation::Local;
        
        // Ensure static mesh options are correctly configured
        if (!ImportUI->StaticMeshImportData)
        {
            ImportUI->StaticMeshImportData = NewObject<UFbxStaticMeshImportData>(ImportUI);
        }
        ImportUI->bImportMesh = true;
        ImportUI->StaticMeshImportData->bCombineMeshes = true;
        ImportUI->StaticMeshImportData->NormalImportMethod = FBXNIM_ComputeNormals;
        ImportUI->StaticMeshImportData->bBuildNanite = true;

        
        ImportTask->Options = ImportUI;

        double StartTime = FPlatformTime::Seconds();

        UE_LOG(LogTemp, Log, TEXT("[Step 5c] Calling AssetTools.ImportAssetTasks for %s -> %s"), *SourcePath, *DestinationPath);

        AssetTools.ImportAssetTasks({ ImportTask });

        double Elapsed = FPlatformTime::Seconds() - StartTime;

        if (ImportTask->ImportedObjectPaths.Num() > 0)
        {
            // Manually save the imported assets
            for (const FString& Path : ImportTask->ImportedObjectPaths)
            {
                UObject* Asset = UEditorAssetLibrary::LoadAsset(Path);
                if (Asset)
                {
                    UEditorAssetLibrary::SaveAsset(Path);
                }
            }

            FString ImportedPath = ImportTask->ImportedObjectPaths[0];
            UE_LOG(LogTemp, Log, TEXT("[Step 5d] SUCCESS in %.2fs: imported=%s (%d total)"), Elapsed, *ImportedPath, ImportTask->ImportedObjectPaths.Num());

            ResultObj->SetBoolField(TEXT("success"), true);
            ResultObj->SetStringField(TEXT("full_path"), ImportedPath);
            ResultObj->SetStringField(TEXT("asset_name"), FPaths::GetBaseFilename(ImportedPath));
            ResultObj->SetStringField(TEXT("message"), FString::Printf(TEXT("Imported to %s in %.1fs"), *ImportedPath, Elapsed));
            ResultObj->SetNumberField(TEXT("imported_count"), ImportTask->ImportedObjectPaths.Num());
        }
        else
        {
            UE_LOG(LogTemp, Error, TEXT("[Step 5d ERROR] Import returned 0 assets after %.2fs (file size: %.2f KB)"), Elapsed, FileSize / 1024.0);
            ResultObj->SetBoolField(TEXT("success"), false);
            ResultObj->SetStringField(TEXT("message"), TEXT("FBX import produced no assets. The file may be corrupted or contain no valid mesh data."));
            ResultObj->SetNumberField(TEXT("imported_count"), 0);
        }
    }
    catch (const std::exception& e)
    {
        UE_LOG(LogTemp, Error, TEXT("[Step 5 EXCEPTION] std::exception during import: %s"), UTF8_TO_TCHAR(e.what()));
        ResultObj->SetBoolField(TEXT("success"), false);
        ResultObj->SetStringField(TEXT("message"), FString::Printf(TEXT("C++ exception during FBX import: %s"), UTF8_TO_TCHAR(e.what())));
    }
    catch (...)
    {
        UE_LOG(LogTemp, Error, TEXT("[Step 5 EXCEPTION] Unknown exception during import"));
        ResultObj->SetBoolField(TEXT("success"), false);
        ResultObj->SetStringField(TEXT("message"), TEXT("Unknown C++ exception during FBX import"));
    }

    ResultObj->SetStringField(TEXT("source_path"), SourcePath);
    ResultObj->SetStringField(TEXT("destination_path"), DestinationPath);
    return ResultObj;
}
