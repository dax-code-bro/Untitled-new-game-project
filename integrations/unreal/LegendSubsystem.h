#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "LegendSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLegendResponse, const FString&, Response);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLegendAsset, const FString&, AssetPath);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLegendError, const FString&, Error);

/**
 * Legend AI Subsystem for Unreal Engine.
 * Accessible from Blueprint and C++ anywhere via GetGameInstance()->GetSubsystem<ULegendSubsystem>()
 */
UCLASS()
class LEGENDPLUGIN_API ULegendSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    UPROPERTY(BlueprintAssignable, Category = "Legend")
    FOnLegendResponse OnResponse;

    UPROPERTY(BlueprintAssignable, Category = "Legend")
    FOnLegendAsset OnModelGenerated;

    UPROPERTY(BlueprintAssignable, Category = "Legend")
    FOnLegendAsset OnTextureGenerated;

    UPROPERTY(BlueprintAssignable, Category = "Legend")
    FOnLegendError OnError;

    /** Send a message to Legend and receive a response. */
    UFUNCTION(BlueprintCallable, Category = "Legend|Chat")
    void Chat(const FString& Message, const FString& Mode = TEXT("conversation"));

    /** Generate a 3D model from a text description. */
    UFUNCTION(BlueprintCallable, Category = "Legend|Creative")
    void GenerateModel(const FString& Description);

    /** Generate a texture from a description. */
    UFUNCTION(BlueprintCallable, Category = "Legend|Creative")
    void GenerateTexture(const FString& Description, int32 Resolution = 2048);

    /** Write a story from a premise. */
    UFUNCTION(BlueprintCallable, Category = "Legend|Story")
    void WriteStory(const FString& Premise, const FString& Genre = TEXT("general"));

    /** Set the Legend API URL (default: http://localhost:8000) */
    UFUNCTION(BlueprintCallable, Category = "Legend|Config")
    void SetApiUrl(const FString& Url) { ApiUrl = Url; }

private:
    FString ApiUrl = TEXT("http://localhost:8000");

    void PostRequest(const FString& Endpoint, const FString& Body,
                     TFunction<void(const FString&)> OnSuccess);
};
