#include "LegendSubsystem.h"
#include "HttpModule.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void ULegendSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogTemp, Log, TEXT("Legend AI Subsystem initialized. API: %s"), *ApiUrl);
}

void ULegendSubsystem::Chat(const FString& Message, const FString& Mode)
{
    FString Body = FString::Printf(TEXT("{\"message\":\"%s\",\"mode\":\"%s\"}"), *Message, *Mode);
    PostRequest(TEXT("/chat"), Body, [this](const FString& Response)
    {
        TSharedPtr<FJsonObject> Json;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response);
        if (FJsonSerializer::Deserialize(Reader, Json))
        {
            FString Resp = Json->GetStringField(TEXT("response"));
            OnResponse.Broadcast(Resp);
        }
    });
}

void ULegendSubsystem::GenerateModel(const FString& Description)
{
    FString Body = FString::Printf(TEXT("{\"description\":\"%s\"}"), *Description);
    PostRequest(TEXT("/creative/model"), Body, [this](const FString& Response)
    {
        TSharedPtr<FJsonObject> Json;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response);
        if (FJsonSerializer::Deserialize(Reader, Json))
        {
            FString Path = Json->GetStringField(TEXT("path"));
            OnModelGenerated.Broadcast(Path);
        }
    });
}

void ULegendSubsystem::GenerateTexture(const FString& Description, int32 Resolution)
{
    FString Body = FString::Printf(
        TEXT("{\"description\":\"%s\",\"resolution\":%d}"), *Description, Resolution);
    PostRequest(TEXT("/creative/texture"), Body, [this](const FString& Response)
    {
        TSharedPtr<FJsonObject> Json;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response);
        if (FJsonSerializer::Deserialize(Reader, Json))
        {
            FString Path = Json->GetStringField(TEXT("path"));
            OnTextureGenerated.Broadcast(Path);
        }
    });
}

void ULegendSubsystem::WriteStory(const FString& Premise, const FString& Genre)
{
    FString Body = FString::Printf(
        TEXT("{\"premise\":\"%s\",\"genre\":\"%s\"}"), *Premise, *Genre);
    PostRequest(TEXT("/story/write"), Body, [this](const FString& Response)
    {
        TSharedPtr<FJsonObject> Json;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response);
        if (FJsonSerializer::Deserialize(Reader, Json))
        {
            FString Story = Json->GetStringField(TEXT("story"));
            OnResponse.Broadcast(Story);
        }
    });
}

void ULegendSubsystem::PostRequest(const FString& Endpoint, const FString& Body,
                                    TFunction<void(const FString&)> OnSuccess)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(ApiUrl + Endpoint);
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(Body);

    Request->OnProcessRequestComplete().BindLambda(
        [this, OnSuccess](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
        {
            if (bSuccess && Resp.IsValid() && Resp->GetResponseCode() == 200)
            {
                OnSuccess(Resp->GetContentAsString());
            }
            else
            {
                FString Err = Resp.IsValid()
                    ? FString::Printf(TEXT("HTTP %d"), Resp->GetResponseCode())
                    : TEXT("Request failed");
                OnError.Broadcast(Err);
            }
        });

    Request->ProcessRequest();
}
